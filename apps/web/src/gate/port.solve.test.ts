// Structural oracles for solve.ts on OUR humanoid scene, ported from mink's
// test_solve_ik.py (pinned 44c8a6ab66d27d06249f9018334a51662605e3e4):
// trivial/fulfilled solutions, single-task convergence, the fused-objective
// equivalence, QP-infeasibility propagation — plus the gate property itself:
// a constrained projection never leaves check.ts's valid set.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POSE_LIBRARY } from '../poses/index';
import sceneXml from '../spike/scene.xml?raw';
import { evaluateQpos } from './check';
import { GateConfiguration } from './configuration';
import { loadGateEngine } from './engine';
import { SE3, SO3 } from './lie';
import { CollisionAvoidanceLimit, ComSupportLimit, ConfigurationLimit, type Limit } from './limits';
import { buildIk, projectStep, solveIk } from './solve';
import { FrameTask, PostureTask, type Task } from './tasks';

let engine: Awaited<ReturnType<typeof loadGateEngine>>;
let config: GateConfiguration;

const stanceQ = () => Float64Array.from(POSE_LIBRARY.poses[0]!.qpos);

beforeAll(async () => {
  engine = await loadGateEngine(sceneXml);
  config = new GateConfiguration(engine, stanceQ());
}, 30_000);

afterAll(() => {
  config.dispose();
  engine.dispose();
});

const norm = (v: ArrayLike<number>, from = 0, to?: number) => {
  let s = 0;
  for (let i = from; i < (to ?? v.length); i++) s += (v[i] as number) ** 2;
  return Math.sqrt(s);
};

describe('trivial and fulfilled solutions (test_solve_ik)', () => {
  it('no tasks ⇒ v == 0 exactly', () => {
    config.update(stanceQ());
    const { v, found } = solveIk(config, [], 1e-3);
    expect(found).toBe(true);
    // Math.abs: the unconstrained minimum −P⁻¹·0 legitimately produces −0.
    for (let i = 0; i < v.length; i++) expect(Math.abs(v[i]!)).toBe(0);
  });

  it('a single already-fulfilled FrameTask ⇒ ‖v‖ ≤ 1e-10', () => {
    config.update(stanceQ());
    const task = new FrameTask('geom', config.geomId('hand_right'), 1, 1);
    task.setTargetFromConfiguration(config);
    const limits = [new ConfigurationLimit(config)];
    const { v, found } = solveIk(config, [task], 1e-3, 1e-12, limits);
    expect(found).toBe(true);
    expect(norm(v)).toBeLessThanOrEqual(1e-10);
  });
});

describe('single-task convergence (port of test_single_task_convergence)', () => {
  it('hand FrameTask converges to a 0.1 m-offset target under limits', () => {
    config.update(stanceQ());
    const hand = config.geomId('hand_right');
    const frameTask = new FrameTask('geom', hand, 1, 1);
    const init = config.getFrameTransform('geom', hand);
    frameTask.setTarget(
      SE3.multiply(init, SE3.fromRotationTranslation(SO3.identity(), [0, 0, 0.1])),
    );
    const posture = new PostureTask(config, 1e-2);
    posture.setTargetFromConfiguration(config);
    const tasks = [frameTask, posture];
    const limits = [new ConfigurationLimit(config)];
    const dt = 5e-3;

    expect(norm(frameTask.computeError(config))).toBeCloseTo(0.1, 6);

    let last = Infinity;
    let finalErr = Infinity;
    for (let step = 0; step < 100; step++) {
      const err = norm(frameTask.computeError(config));
      // Strict decrease, allowing a numerical plateau of ≤ 1e-12.
      expect(err, `step ${step}`).toBeLessThanOrEqual(last + 1e-12);
      finalErr = err;
      if (err < 1e-9) break;
      last = err;
      const { found } = projectStep(config, tasks, dt, 1e-12, limits);
      expect(found, `step ${step}`).toBe(true);
    }
    const posErr = norm(frameTask.computeError(config), 0, 3);
    // Observed on this scene: ‖e‖ reaches ~1e-13 (the 1e-9 break) well inside
    // the 100-step budget; strict decrease never plateaus above it.
    console.info(
      `convergence: final ‖e‖=${finalErr.toExponential(3)}, ‖e_pos‖=${posErr.toExponential(3)}`,
    );
    expect(posErr).toBeLessThan(1e-5);
    config.update(stanceQ());
  }, 60_000);
});

describe('fused-objective equivalence (test_fused_objective_matches_per_task_sum)', () => {
  it('buildIk H,c equal the per-task assembly sum plus global damping', () => {
    config.update(stanceQ());
    const frame = new FrameTask('geom', config.geomId('hand_right'), 1, 1, 1, 1e-2);
    frame.setTargetFromConfiguration(config);
    const posture = new PostureTask(config, 1e-1, 1, 1e-3);
    posture.setTargetFromConfiguration(config);
    const tasks: Task[] = [frame, posture];

    // Perturb so errors (and hence the LM terms) are nonzero, as upstream.
    const q = stanceQ();
    q[0] = q[0]! + 0.2;
    q[1] = q[1]! + 0.2;
    q[2] = q[2]! + 0.2;
    config.update(q);

    const damping = 1e-6;
    const nv = config.nv;
    const { H, c } = buildIk(config, tasks, 0.02, damping);

    const refH = new Float64Array(nv * nv);
    const refC = new Float64Array(nv);
    for (const task of tasks) task.assembleInto(refH, refC, config);
    for (let i = 0; i < nv; i++) refH[i * nv + i] = refH[i * nv + i]! + damping;

    for (let i = 0; i < H.length; i++) {
      expect(Math.abs(H[i]! - refH[i]!)).toBeLessThanOrEqual(1e-12 + 1e-9 * Math.abs(refH[i]!));
    }
    for (let i = 0; i < c.length; i++) {
      expect(Math.abs(c[i]! - refC[i]!)).toBeLessThanOrEqual(1e-12 + 1e-9 * Math.abs(refC[i]!));
    }
    config.update(stanceQ());
  });
});

describe('infeasibility propagates', () => {
  it('contradictory ConfigurationLimit bounds ⇒ found:false, v = 0, q unchanged', () => {
    const q0 = stanceQ();
    config.update(q0);
    // minDistanceFromLimits far beyond every half-range flips lower > upper,
    // making the +P / −P row pair contradictory for every hinge.
    const impossible = new ConfigurationLimit(config, 0.95, 10);
    const posture = new PostureTask(config, 1);
    posture.setTargetFromConfiguration(config);
    const result = projectStep(config, [posture], 5e-3, 1e-12, [impossible]);
    expect(result.found).toBe(false);
    expect(norm(result.v)).toBe(0);
    const q = config.q;
    for (let i = 0; i < q.length; i++) expect(q[i]).toBe(q0[i]!);
  });
});

describe('the gate property: projection never leaves the valid set', () => {
  it('50 constrained steps toward a far hand target keep every qpos gate-valid', () => {
    const q0 = stanceQ();
    config.update(q0);
    expect(evaluateQpos(engine, q0).valid).toBe(true);
    config.update(q0); // evaluateQpos ran mj_forward; restore our kinematics

    const hand = config.geomId('hand_right');
    const init = config.getFrameTransform('geom', hand);
    // 0.5 m forward-and-down in the world frame.
    const target = SE3.fromRotationTranslation(
      { wxyz: Float64Array.from(init.wxyzXyz.subarray(0, 4)) },
      [init.wxyzXyz[4]! + 0.354, init.wxyzXyz[5]!, init.wxyzXyz[6]! - 0.354],
    );
    const handTask = new FrameTask('geom', hand, 1, 0, 0.5, 1.0);
    handTask.setTarget(target);
    // Formulation choice (documented): anchor both feet with FrameTasks —
    // nothing else pins the free-floating root, and without an anchor the QP
    // reaches the target by translating the whole body (feet through floor).
    const footRight = new FrameTask('body', config.bodyId('foot_right'), 5, 5, 0.5);
    footRight.setTargetFromConfiguration(config);
    const footLeft = new FrameTask('body', config.bodyId('foot_left'), 5, 5, 0.5);
    footLeft.setTargetFromConfiguration(config);
    const posture = new PostureTask(config, 1e-2, 0.5);
    posture.setTargetFromConfiguration(config);
    const tasks: Task[] = [handTask, footRight, footLeft, posture];
    const limits: Limit[] = [
      new ConfigurationLimit(config),
      new ComSupportLimit(),
      // Feet excluded: they live in permanent grounding contact; only the
      // reaching hand needs active floor avoidance.
      new CollisionAvoidanceLimit(config, [['hand_right', 'floor']]),
    ];
    const dt = 0.05;

    const initialErr = norm(handTask.computeError(config), 0, 3);
    for (let step = 0; step < 50; step++) {
      const { found } = projectStep(config, tasks, dt, 1e-12, limits);
      expect(found, `step ${step}`).toBe(true);
      const q = config.q;
      const gate = evaluateQpos(engine, q);
      expect(
        gate.valid,
        `step ${step}: jointLimits=${gate.jointLimits} comInSupport=${gate.comInSupport} pen=${gate.maxPenetrationM}`,
      ).toBe(true);
      config.update(q); // restore kinematics after evaluateQpos's mj_forward
    }
    const finalErr = norm(handTask.computeError(config), 0, 3);
    console.info(`gate e2e: hand ‖e_pos‖ ${initialErr.toFixed(4)} → ${finalErr.toFixed(4)} m`);
    // The projection must make real progress, not just sit still.
    expect(finalErr).toBeLessThan(initialErr / 2);
    config.update(stanceQ());
  }, 120_000);
});
