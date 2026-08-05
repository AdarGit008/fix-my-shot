/* Editor session — the pose-edit state machine (issue #10, ADR-0009).
 *
 * DOM-free and renderer-free so the whole edit lifecycle is unit-testable: the
 * page (EditorPage.tsx) owns pointers and three.js; this owns poses and
 * verdicts. The lifecycle per drag:
 *
 *   beginDrag(frame)          — anchor the committed pose
 *   previewDrag(target)       — incremental gate projection from the current
 *                               preview (a few steps per pointer frame): the
 *                               live drag preview is itself constraint-aware,
 *                               phase-bounded, and cheap (ADR-0010)
 *   endDrag(target)           — the authoritative proposal: ONE full projection
 *                               from the drag's anchor to the final target, so
 *                               the committed result is a single deterministic
 *                               projection, never the accumulated preview path.
 *                               Accepted ⇒ commit + undo history; rejected ⇒
 *                               revert to the anchor with a diagnosis of what
 *                               the previewed pose violated (reject-and-revert,
 *                               SPEC acceptance #2).
 *
 * Phase pinning: the pose's phase is fixed at load (ADR-0009); every projection
 * runs under PhaseBoundLimit + BallTetherLimit for that phase, and commits are
 * belt-and-braces re-checked with checkPhaseBounds after the gate's authority
 * verdict.
 */

import { PHASE_BOUNDS, SHOOTING_HAND_BODY, type PhaseId } from '@fix-my-shot/basketball';
import { CollisionAvoidanceLimit, GateConfiguration, type Gate, type Limit } from '../gate';
import type { GateEngine } from '../gate';
import type { LibraryPose, PoseGate } from '../poses';
import {
  BallTetherLimit,
  EDITOR_COLLISION_PAIRS,
  PhaseBoundLimit,
  checkPhaseBounds,
  resolvePhaseBounds,
  type PhaseBoundViolation,
  type ResolvedPhaseBounds,
} from './limits';

/** The per-phase machinery the session needs: resolved bounds + projection limits. */
export interface PhaseMachinery {
  readonly resolved: ResolvedPhaseBounds;
  readonly limits: readonly Limit[];
}

/** Supplies PhaseMachinery per phase (real engine-backed or a test stub). */
export interface BoundsProvider {
  get(phase: PhaseId): PhaseMachinery;
  dispose(): void;
}

/** Engine-backed BoundsProvider: resolves PHASE_BOUNDS against the compiled
 * model once per phase and builds the two projection limits. */
export function createBoundsProvider(engine: GateEngine): BoundsProvider {
  const configuration = new GateConfiguration(engine);
  const cache = new Map<PhaseId, PhaseMachinery>();
  // Phase-independent and stateless per call — one instance shared by all phases.
  const collisions = new CollisionAvoidanceLimit(configuration, EDITOR_COLLISION_PAIRS);
  return {
    get(phase) {
      let machinery = cache.get(phase);
      if (!machinery) {
        const resolved = resolvePhaseBounds(configuration, PHASE_BOUNDS[phase]);
        machinery = {
          resolved,
          limits: [
            new PhaseBoundLimit(resolved),
            new BallTetherLimit(configuration, {
              ballBody: 'ball',
              handBody: SHOOTING_HAND_BODY,
              maxDistM: resolved.ballHandMaxM,
            }),
            collisions,
          ],
        };
        cache.set(phase, machinery);
      }
      return machinery;
    },
    dispose() {
      configuration.dispose();
    },
  };
}

/** A drag handle: which model frame the pointer grabbed. */
export interface EditorDragFrame {
  readonly frameType: 'body' | 'geom';
  readonly frameId: number;
}

/** The verdict of one completed drag. */
export interface EditorVerdict {
  readonly accepted: boolean;
  /** Authority verdict — of the committed pose when accepted, of the rejected
   * previewed pose when not (so the UI can say WHICH check failed). */
  readonly gate: PoseGate;
  /** Phase-envelope violations of the rejected previewed pose (empty when
   * accepted — commits are re-checked and must be violation-free). */
  readonly boundViolations: readonly PhaseBoundViolation[];
  /** Projection steps of the authoritative (endDrag) projection. */
  readonly steps: number;
}

export interface EditorSessionOptions {
  /** Projection steps per previewDrag call (small: the per-frame budget). */
  previewSteps?: number;
  /** Projection step cap for the authoritative endDrag projection. */
  commitSteps?: number;
}

export class EditorSession {
  readonly #gate: Gate;
  readonly #bounds: BoundsProvider;
  readonly #previewSteps: number;
  readonly #commitSteps: number;

  #pose: LibraryPose | null = null;
  #machinery: PhaseMachinery | null = null;
  #committed: Float64Array = new Float64Array(0);
  #history: Float64Array[] = [];
  #drag: { frame: EditorDragFrame; anchor: Float64Array; preview: Float64Array } | null = null;

  constructor(gate: Gate, bounds: BoundsProvider, options: EditorSessionOptions = {}) {
    this.#gate = gate;
    this.#bounds = bounds;
    this.#previewSteps = options.previewSteps ?? 2;
    this.#commitSteps = options.commitSteps ?? 50;
  }

  /** Load a library pose: pins its phase, resets history and any live drag. */
  load(pose: LibraryPose): void {
    const machinery = this.#bounds.get(pose.phase as PhaseId);
    const qpos = Float64Array.from(pose.qpos);
    const violations = checkPhaseBounds(machinery.resolved, qpos);
    if (violations.length > 0) {
      // Library poses are envelope-tested; a violation here means the bounds
      // and the shipped library have drifted apart — fail loud, never clamp a
      // shipped pose silently.
      const list = violations.map((v) => v.parameter).join(', ');
      throw new Error(`pose '${pose.id}' is outside its phase envelope: ${list}`);
    }
    this.#pose = pose;
    this.#machinery = machinery;
    this.#committed = qpos;
    this.#history = [];
    this.#drag = null;
  }

  get pose(): LibraryPose | null {
    return this.#pose;
  }

  get phase(): PhaseId | null {
    return (this.#pose?.phase as PhaseId) ?? null;
  }

  /** The committed (gate-valid, in-phase) pose. */
  get committedQpos(): Float64Array {
    return Float64Array.from(this.#committed);
  }

  /** What the view should render right now: the live preview during a drag,
   * the committed pose otherwise. */
  get displayQpos(): Float64Array {
    return Float64Array.from(this.#drag ? this.#drag.preview : this.#committed);
  }

  get dragging(): boolean {
    return this.#drag !== null;
  }

  get canUndo(): boolean {
    return this.#history.length > 0;
  }

  #requireLoaded(): PhaseMachinery {
    if (!this.#machinery || !this.#pose) throw new Error('EditorSession: no pose loaded');
    return this.#machinery;
  }

  /** Start a drag on a grabbed frame; anchors the committed pose. */
  beginDrag(frame: EditorDragFrame): void {
    this.#requireLoaded();
    this.#drag = {
      frame,
      anchor: Float64Array.from(this.#committed),
      preview: Float64Array.from(this.#committed),
    };
  }

  /**
   * Advance the live preview toward the pointer's world target with a few
   * projection steps (ADR-0010): every previewed pose is phase-bounded and QP-
   * feasible; an infeasible micro-step just leaves the preview where it was.
   */
  previewDrag(position: ArrayLike<number>): Float64Array {
    const machinery = this.#requireLoaded();
    const drag = this.#drag;
    if (!drag) throw new Error('EditorSession: previewDrag without beginDrag');
    const result = this.#gate.project(
      drag.preview,
      { frameType: drag.frame.frameType, frameId: drag.frame.frameId, position },
      { maxSteps: this.#previewSteps, extraLimits: machinery.limits },
    );
    if (result.accepted) drag.preview = result.qpos;
    return this.displayQpos;
  }

  /** Abandon the drag: the preview is dropped, the committed pose stands. */
  cancelDrag(): void {
    this.#drag = null;
  }

  /**
   * Finish the drag: one authoritative projection from the drag's anchor to
   * the final target. Accepted ⇒ commit (with a belt-and-braces envelope
   * re-check) + history push; rejected ⇒ revert, diagnosing the previewed pose.
   */
  endDrag(position: ArrayLike<number>): EditorVerdict {
    const machinery = this.#requireLoaded();
    const drag = this.#drag;
    if (!drag) throw new Error('EditorSession: endDrag without beginDrag');
    this.#drag = null;

    const result = this.#gate.project(
      drag.anchor,
      { frameType: drag.frame.frameType, frameId: drag.frame.frameId, position },
      { maxSteps: this.#commitSteps, extraLimits: machinery.limits },
    );

    if (result.accepted) {
      const violations = checkPhaseBounds(machinery.resolved, result.qpos);
      if (violations.length === 0) {
        this.#history.push(drag.anchor);
        this.#committed = result.qpos;
        return { accepted: true, gate: result.gate, boundViolations: [], steps: result.steps };
      }
      // Projection accepted but escaped the envelope (numerically possible if
      // a gain lets a step overshoot): treat as rejected — clamp-before-gate
      // (ADR-0009) means an out-of-envelope pose is never committed.
      return {
        accepted: false,
        gate: result.gate,
        boundViolations: violations,
        steps: result.steps,
      };
    }

    // Rejected: diagnose what the user was looking at (the last preview) so
    // the UI can name the failing check; the committed pose is untouched.
    return {
      accepted: false,
      gate: this.#gate.evaluate(drag.preview),
      boundViolations: checkPhaseBounds(machinery.resolved, drag.preview),
      steps: result.steps,
    };
  }

  /** Undo the last accepted edit. Returns false when there is nothing to undo. */
  undo(): boolean {
    const previous = this.#history.pop();
    if (!previous) return false;
    this.#committed = previous;
    this.#drag = null;
    return true;
  }

  /** Reset to the loaded library pose, clearing history. */
  reset(): void {
    const pose = this.#pose;
    if (!pose) return;
    this.#committed = Float64Array.from(pose.qpos);
    this.#history = [];
    this.#drag = null;
  }
}
