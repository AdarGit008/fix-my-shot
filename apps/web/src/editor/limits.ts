/* Per-phase edit limits for the pose editor (issue #10, ADR-0009).
 *
 * Two ORIGINAL Limit implementations (not ported from mink) composed into the
 * gate projection through createGate's extraLimits seam:
 *
 *  - PhaseBoundLimit — the phase envelope as hard QP inequalities: every
 *    editable hinge is kept inside its labelled phase's [min, max] window
 *    (PHASE_BOUNDS ∩ the model's anatomical range), and the ball centre is
 *    kept inside the phase's height band. Same row construction as the ported
 *    ConfigurationLimit (gain-damped displacement bounds, dt-invariant), with
 *    per-phase windows instead of anatomical ranges.
 *
 *  - BallTetherLimit — the editable half of the hand/ball contact encoding:
 *    a single linearized row keeping ‖ball centre − shooting-hand centre‖
 *    within the phase tether, so dragging the arm tows the ball and the ball
 *    cannot be dragged out of reach. Deliberately expressed in DISPLACEMENT
 *    space (h carries no 1/dt factor — unlike the ported CollisionAvoidance-
 *    Limit, which preserves upstream's velocity-space quirk for oracle
 *    fidelity; there is no upstream to be faithful to here).
 *
 * Both limits read only pre-resolved constants at construction; the live
 * GateConfiguration handed to computeQpInequalities supplies all state.
 */

import type { PhaseEditBounds } from '@fix-my-shot/basketball';
import type { GateConfiguration, Limit, QpInequalities } from '../gate';

/**
 * Collision pairs the EDITOR's projections must steer around, beyond the
 * facade's default drag↔floor pair. Discovered the honest way: without them
 * the projection happily converges into authority-rejected penetration (e.g.
 * raising a collapsed follow-through arm swings the hanging GUIDE hand into
 * the parked ball — hand_left↔ball at 10 mm — and every drag from that pose
 * dies at the final gate check). The set covers the ball against the torso
 * column + both arms, and each arm against the head/torso; parent-child and
 * welded pairs are filtered by CollisionAvoidanceLimit itself.
 */
export const EDITOR_COLLISION_PAIRS: readonly (readonly [string, string])[] = [
  // ball ↔ body (the ball is parked next to the shooting hand; 5 mm min
  // distance matches the gate's penetration tolerance)
  ['ball', 'hand_left'],
  ['ball', 'lower_arm_left'],
  ['ball', 'upper_arm_left'],
  ['ball', 'hand_right'],
  ['ball', 'lower_arm_right'],
  ['ball', 'head'],
  ['ball', 'torso'],
  ['ball', 'waist_upper'],
  ['ball', 'waist_lower'],
  ['ball', 'butt'],
  // arms ↔ head/torso column (the classic fold-into-yourself edits)
  ['hand_right', 'head'],
  ['hand_right', 'torso'],
  ['hand_right', 'waist_upper'],
  ['lower_arm_right', 'head'],
  ['lower_arm_right', 'torso'],
  ['hand_left', 'head'],
  ['hand_left', 'torso'],
  ['hand_left', 'waist_upper'],
  ['lower_arm_left', 'head'],
  ['lower_arm_left', 'torso'],
];

const DEG2RAD = Math.PI / 180;
const MJ_MINVAL = 1e-15;

/** One resolved hinge window: qpos/dof addresses + effective radian bounds. */
export interface ResolvedJointBound {
  readonly joint: string;
  readonly qposAdr: number;
  readonly dofAdr: number;
  readonly loRad: number;
  readonly hiRad: number;
}

/** PHASE_BOUNDS resolved against the compiled model (ids, radians). */
export interface ResolvedPhaseBounds {
  readonly joints: readonly ResolvedJointBound[];
  readonly ballZ: { readonly qposAdr: number; readonly dofAdr: number };
  readonly ballHeightM: { readonly min: number; readonly max: number };
  readonly ballHandMaxM: number;
}

/** One out-of-envelope parameter from {@link checkPhaseBounds}. */
export interface PhaseBoundViolation {
  readonly parameter: string;
  readonly value: number;
  readonly lo: number;
  readonly hi: number;
}

/**
 * Resolve a phase's edit bounds against the compiled model: joint windows are
 * converted to radians and intersected with the model's own anatomical ranges
 * (the authored table is already inside them — tested — but the model is the
 * authority), and the ball's free-joint height slot is located by name.
 */
export function resolvePhaseBounds(
  configuration: GateConfiguration,
  bounds: PhaseEditBounds,
): ResolvedPhaseBounds {
  const joints: ResolvedJointBound[] = [];
  for (const [joint, { minDeg, maxDeg }] of Object.entries(bounds.joints)) {
    const id = configuration.jointId(joint);
    joints.push({
      joint,
      qposAdr: configuration.jntQposadr[id]!,
      dofAdr: configuration.jntDofadr[id]!,
      loRad: Math.max(minDeg * DEG2RAD, configuration.jntRange[2 * id]!),
      hiRad: Math.min(maxDeg * DEG2RAD, configuration.jntRange[2 * id + 1]!),
    });
  }
  const ballJoint = configuration.jointId('ball_free');
  return {
    joints,
    ballZ: {
      qposAdr: configuration.jntQposadr[ballJoint]! + 2,
      dofAdr: configuration.jntDofadr[ballJoint]! + 2,
    },
    ballHeightM: bounds.ballHeightM,
    ballHandMaxM: bounds.ballHandMaxM,
  };
}

/** Every parameter of `qpos` outside the resolved envelope (empty ⇒ in-phase).
 * The default tolerance absorbs the pose library's 6-decimal qpos rounding
 * (poses generated exactly at a window edge round up to ~5e-7 past it). */
export function checkPhaseBounds(
  resolved: ResolvedPhaseBounds,
  qpos: ArrayLike<number>,
  tolRad = 1e-6,
): PhaseBoundViolation[] {
  const violations: PhaseBoundViolation[] = [];
  for (const b of resolved.joints) {
    const value = qpos[b.qposAdr] as number;
    if (value < b.loRad - tolRad || value > b.hiRad + tolRad) {
      violations.push({ parameter: b.joint, value, lo: b.loRad, hi: b.hiRad });
    }
  }
  const z = qpos[resolved.ballZ.qposAdr] as number;
  const { min, max } = resolved.ballHeightM;
  if (z < min - tolRad || z > max + tolRad) {
    violations.push({ parameter: 'ball_height', value: z, lo: min, hi: max });
  }
  return violations;
}

/** A copy of `qpos` with every bounded parameter clamped into the envelope
 * (ADR-0009: an edit is clamped to the phase bounds before the gate runs). */
export function clampToPhaseBounds(
  resolved: ResolvedPhaseBounds,
  qpos: ArrayLike<number>,
): Float64Array {
  const out = Float64Array.from(qpos as ArrayLike<number>);
  for (const b of resolved.joints) {
    out[b.qposAdr] = Math.min(b.hiRad, Math.max(b.loRad, out[b.qposAdr]!));
  }
  const { qposAdr } = resolved.ballZ;
  const { min, max } = resolved.ballHeightM;
  out[qposAdr] = Math.min(max, Math.max(min, out[qposAdr]!));
  return out;
}

/**
 * Hard per-phase envelope rows: Δq ≤ gain·(hi ⊖ q) and −Δq ≤ gain·(q ⊖ lo) per
 * editable hinge, plus the same pair on the ball's world-z translation dof
 * (free-joint linear velocity is world-frame, so the row is exact, not
 * linearized). dt-invariant displacement bounds, as ConfigurationLimit.
 */
export class PhaseBoundLimit implements Limit {
  readonly resolved: ResolvedPhaseBounds;
  readonly gain: number;

  constructor(resolved: ResolvedPhaseBounds, gain = 0.95) {
    if (!(gain > 0 && gain <= 1)) {
      throw new Error('PhaseBoundLimit: gain must be in the range (0, 1]');
    }
    this.resolved = resolved;
    this.gain = gain;
  }

  computeQpInequalities(configuration: GateConfiguration, _dt: number): QpInequalities | null {
    void _dt; // dt-invariant: displacement bounds.
    const { joints, ballZ, ballHeightM } = this.resolved;
    const nb = joints.length + 1; // + the ball height band
    const nv = configuration.nv;
    const q = configuration.q;
    const G = new Float64Array(2 * nb * nv);
    const h = new Float64Array(2 * nb);
    for (let i = 0; i < joints.length; i++) {
      const b = joints[i]!;
      const qi = q[b.qposAdr]!;
      G[i * nv + b.dofAdr] = 1;
      G[(nb + i) * nv + b.dofAdr] = -1;
      h[i] = this.gain * (b.hiRad - qi);
      h[nb + i] = this.gain * (qi - b.loRad);
    }
    const zi = q[ballZ.qposAdr]!;
    const last = joints.length;
    G[last * nv + ballZ.dofAdr] = 1;
    G[(nb + last) * nv + ballZ.dofAdr] = -1;
    h[last] = this.gain * (ballHeightM.max - zi);
    h[nb + last] = this.gain * (zi - ballHeightM.min);
    return { G, h, count: 2 * nb };
  }
}

/**
 * Tether row: with d = p_ball − p_hand, dist = ‖d‖ and n = d/dist, constrain
 * n·(J_ball − J_hand)·Δq ≤ gain·(maxDist − dist) — the first-order condition
 * for the post-step distance to stay inside the tether. Point Jacobians are
 * taken at the two body origins (ball centre / hand centre).
 */
export class BallTetherLimit implements Limit {
  readonly ballBodyId: number;
  readonly handBodyId: number;
  readonly maxDistM: number;
  readonly gain: number;

  constructor(
    configuration: GateConfiguration,
    options: { ballBody: string; handBody: string; maxDistM: number; gain?: number },
  ) {
    this.ballBodyId = configuration.bodyId(options.ballBody);
    this.handBodyId = configuration.bodyId(options.handBody);
    this.maxDistM = options.maxDistM;
    this.gain = options.gain ?? 0.85;
  }

  computeQpInequalities(configuration: GateConfiguration, _dt: number): QpInequalities | null {
    void _dt; // dt-invariant: displacement-space damper (see file header).
    const { mj, model, data } = configuration.engine;
    const nv = configuration.nv;
    // Re-acquire the view per call (heap growth detaches cached views).
    const xpos = data.xpos as ArrayLike<number>;
    const px = (b: number, k: number) => xpos[3 * b + k] as number;
    const dx = px(this.ballBodyId, 0) - px(this.handBodyId, 0);
    const dy = px(this.ballBodyId, 1) - px(this.handBodyId, 1);
    const dz = px(this.ballBodyId, 2) - px(this.handBodyId, 2);
    const dist = Math.hypot(dx, dy, dz);
    if (dist < MJ_MINVAL) return null; // coincident centres: no direction to bound
    const nx = dx / dist;
    const ny = dy / dist;
    const nz = dz / dist;

    const ballPoint = [px(this.ballBodyId, 0), px(this.ballBodyId, 1), px(this.ballBodyId, 2)];
    const handPoint = [px(this.handBodyId, 0), px(this.handBodyId, 1), px(this.handBodyId, 2)];
    const jacBall = new mj.DoubleBuffer(3 * nv) as { GetView(): Float64Array; delete(): void };
    const jacHand = new mj.DoubleBuffer(3 * nv) as { GetView(): Float64Array; delete(): void };
    try {
      mj.mj_jac(model, data, jacBall, null, ballPoint, this.ballBodyId);
      mj.mj_jac(model, data, jacHand, null, handPoint, this.handBodyId);
      const jb = jacBall.GetView();
      const jh = jacHand.GetView();
      const G = new Float64Array(nv);
      for (let c = 0; c < nv; c++) {
        const rx = jb[c]! - jh[c]!;
        const ry = jb[nv + c]! - jh[nv + c]!;
        const rz = jb[2 * nv + c]! - jh[2 * nv + c]!;
        G[c] = nx * rx + ny * ry + nz * rz;
      }
      const h = Float64Array.of(this.gain * (this.maxDistM - dist));
      return { G, h, count: 1 };
    } finally {
      jacHand.delete();
      jacBall.delete();
    }
  }
}
