/* Physical-validity gate — public surface (issue #9, ADR-0009).
 *
 * Two layers:
 *
 * 1. `evaluateQpos` (from check.ts) — the AUTHORITY. The static three-check
 *    classifier in lockstep with tools/posegen/gate.py: joint limits (±0.5°
 *    slack), COM-in-support (world subtree COM incl. ball vs the foot-capsule
 *    endpoint hull), contact penetration ≤ 5 mm over all pairs. All 33
 *    shipped library poses pass it from stored qpos.
 *
 * 2. The mink-ported differential-IK projection (configuration/tasks/limits/
 *    solve, pinned kevinzakka/mink 44c8a6ab66d27d06249f9018334a51662605e3e4)
 *    — steers an edit toward a drag target while inequalities keep it inside
 *    the feasible set. The projection never overrides the authority: after
 *    projecting, the result is re-checked and an invalid or infeasible step
 *    is rejected wholesale (reject-and-revert, ADR-0009 / SPEC acceptance
 *    criterion 2 — an invalid pose is never scored).
 *
 * `createGate` wires the proven default formulation (port.solve.test.ts test
 * "projection never leaves the valid set"): drag FrameTask + both-feet anchor
 * FrameTasks (nothing else pins the free root) + PostureTask regularizer, under
 * ConfigurationLimit + ComSupportLimit + CollisionAvoidanceLimit(drag↔floor).
 * Issue #10's editor composes its own tasks on top of the same primitives.
 */
import { evaluateQpos } from './check';
import { GateConfiguration, type FrameType } from './configuration';
import type { GateEngine } from './engine';
import type { PoseGate } from '../poses';
import { CollisionAvoidanceLimit, ComSupportLimit, ConfigurationLimit, type Limit } from './limits';
import { SE3, SO3 } from './lie';
import { FrameTask, PostureTask, type Task } from './tasks';
import { projectStep } from './solve';

export {
  convexHull,
  evaluateQpos,
  footprint,
  LIMIT_TOL_DEG,
  MAX_PENETRATION_M,
  pointInHull,
} from './check';
export { GateConfiguration, type FrameType, type LimitViolation } from './configuration';
export { loadGateEngine, type GateEngine, type MujocoModule } from './engine';
export { SE3, SO3, type Rng } from './lie';
export {
  CollisionAvoidanceLimit,
  ComSupportLimit,
  ConfigurationLimit,
  VelocityLimit,
  type Limit,
  type QpInequalities,
} from './limits';
export { solveQp, type QpResult } from './qp';
export { buildIk, projectStep, solveIk, type IkProblem, type IkResult } from './solve';
export { ComTask, FrameTask, PostureTask, Task } from './tasks';

/** A drag proposal: pull `frame` toward `position` (world, metres). */
export interface DragTarget {
  frameType: FrameType;
  frameId: number;
  position: ArrayLike<number>;
}

export interface ProjectOptions {
  /** Integration step per iteration (proven default 0.05). */
  dt?: number;
  /** Iteration cap (proven default 50). */
  maxSteps?: number;
  /** Early-stop when max|v| drops below this (rad/s or m/s per dof). */
  stopVelocity?: number;
  /** Extra tasks composed into every step (e.g. #10 phase-bound extras). */
  extraTasks?: readonly Task[];
  /** Extra limits composed into every step. */
  extraLimits?: readonly Limit[];
}

export interface ProjectResult {
  /** The accepted gate-valid qpos, or a copy of `fromQpos` when rejected. */
  qpos: Float64Array;
  /** Authority verdict for `qpos` (of the projected pose when accepted, of the reverted input otherwise). */
  gate: PoseGate;
  accepted: boolean;
  /** Integration steps applied to the configuration (0 ⇒ qpos untouched). */
  steps: number;
}

export interface Gate {
  /** The authority classifier on a raw qpos (length nq = 35). */
  evaluate(qpos: ArrayLike<number>): PoseGate;
  /**
   * Project `fromQpos` toward a drag target through the differential-IK QP,
   * then re-check with the authority. Rejected (QP infeasible at any step, or
   * final pose invalid) ⇒ the result carries `fromQpos` unchanged.
   */
  project(fromQpos: ArrayLike<number>, drag: DragTarget, options?: ProjectOptions): ProjectResult;
  dispose(): void;
}

export function createGate(engine: GateEngine): Gate {
  const configuration = new GateConfiguration(engine);
  const floorGeom = configuration.geomId('floor');
  const footRightBody = configuration.bodyId('foot_right');
  const footLeftBody = configuration.bodyId('foot_left');

  return {
    evaluate(qpos) {
      return evaluateQpos(engine, qpos);
    },

    project(fromQpos, drag, options = {}) {
      const {
        dt = 0.05,
        maxSteps = 50,
        stopVelocity = 1e-6,
        extraTasks = [],
        extraLimits = [],
      } = options;
      const from = Float64Array.from(fromQpos as ArrayLike<number>);
      const reject = (steps: number): ProjectResult => ({
        qpos: Float64Array.from(from),
        gate: evaluateQpos(engine, from),
        accepted: false,
        steps,
      });

      configuration.update(from);

      // Drag task: position-only, damped for unreachable targets (upstream
      // guidance; proven in the gate-property test).
      const dragTask = new FrameTask(drag.frameType, drag.frameId, 1, 0, 0.5, 1.0);
      const current = configuration.getFrameTransform(drag.frameType, drag.frameId);
      dragTask.setTarget(
        SE3.fromRotationTranslation(
          SO3.fromQuatWxyz(current.wxyzXyz.subarray(0, 4)),
          drag.position,
        ),
      );

      // Feet anchors — nothing else pins the free-floating root.
      const footRight = new FrameTask('body', footRightBody, 5, 5, 0.5);
      footRight.setTargetFromConfiguration(configuration);
      const footLeft = new FrameTask('body', footLeftBody, 5, 5, 0.5);
      footLeft.setTargetFromConfiguration(configuration);

      const posture = new PostureTask(configuration, 0.01, 0.5);
      posture.setTarget(from);

      const dragPairs: [number, number][] =
        drag.frameType === 'geom' ? [[drag.frameId, floorGeom]] : [];
      const limits: Limit[] = [
        new ConfigurationLimit(configuration),
        new ComSupportLimit(),
        ...(dragPairs.length > 0 ? [new CollisionAvoidanceLimit(configuration, dragPairs)] : []),
        ...extraLimits,
      ];
      const tasks: Task[] = [dragTask, footRight, footLeft, posture, ...extraTasks];

      let steps = 0;
      for (; steps < maxSteps; steps++) {
        const result = projectStep(configuration, tasks, dt, 1e-12, limits);
        if (!result.found) return reject(steps);
        let vMax = 0;
        for (const vi of result.v) vMax = Math.max(vMax, Math.abs(vi));
        if (vMax < stopVelocity) {
          steps++; // count the step that was just integrated before stopping
          break;
        }
      }

      const projected = Float64Array.from(configuration.q);
      const gate = evaluateQpos(engine, projected);
      if (!gate.valid) return reject(steps);
      return { qpos: projected, gate, accepted: true, steps };
    },

    dispose() {
      configuration.dispose();
    },
  };
}
