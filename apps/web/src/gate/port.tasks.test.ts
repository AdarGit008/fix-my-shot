// Structural oracles for tasks.ts, ported from mink's test suite (pinned
// 44c8a6ab66d27d06249f9018334a51662605e3e4) onto OUR humanoid scene:
// - test_jacobians.py's finite-difference harness (without upstream's
//   jnt_type-vs-SUPPORTED_FRAMES string-comparison bug: we draw every hinge
//   uniformly WITHIN its authored range, root/ball at library-pose values).
// - unit-cost/gain identities (H = JᵀJ, c = eᵀJ) and the Levenberg-Marquardt
//   term μ = lmDamping·(We·We) from task.py's _weighted_residual/_assemble_qp.
// Seeded mulberry32 everywhere; never Math.random.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POSE_LIBRARY } from '../poses/index';
import sceneXml from '../spike/scene.xml?raw';
import { GateConfiguration } from './configuration';
import { loadGateEngine } from './engine';
import { SE3, SO3 } from './lie';
import { ComTask, FrameTask, PostureTask, type Task } from './tasks';

/** Deterministic PRNG on [0, 1) (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let engine: Awaited<ReturnType<typeof loadGateEngine>>;
let config: GateConfiguration;

/** stance-clean library pose (root/ball values reused for random configs). */
const baseQ = () => Float64Array.from(POSE_LIBRARY.poses[0]!.qpos);

beforeAll(async () => {
  engine = await loadGateEngine(sceneXml);
  config = new GateConfiguration(engine, baseQ());
}, 30_000);

afterAll(() => {
  config.dispose();
  engine.dispose();
});

/** Random q: hinges uniform within their ranges, root/ball at library values. */
function randomQ(rng: () => number): Float64Array {
  const q = baseQ();
  for (const j of config.hingeJointIds) {
    const lo = config.jntRange[2 * j]!;
    const hi = config.jntRange[2 * j + 1]!;
    q[config.jntQposadr[j]!] = lo + (hi - lo) * rng();
  }
  return q;
}

/**
 * ‖J − J_fd‖∞ (matrix inf-norm = max abs row sum, mink's norm choice) with
 * J_fd[:,i] = (e(q ⊕ h·eᵢ) − e(q))/h via configuration.integrate.
 */
function fdJacobianError(task: Task, q0: Float64Array, h: number): number {
  config.update(q0);
  const J0 = task.computeJacobian(config);
  const e0 = task.computeError(config);
  const k = e0.length;
  const nv = config.nv;
  const Jfd = new Float64Array(k * nv);
  for (let i = 0; i < nv; i++) {
    config.update(q0);
    const basis = new Float64Array(nv);
    basis[i] = 1;
    config.update(config.integrate(basis, h));
    const ei = task.computeError(config);
    for (let r = 0; r < k; r++) Jfd[r * nv + i] = (ei[r]! - e0[r]!) / h;
  }
  config.update(q0);
  let worst = 0;
  for (let r = 0; r < k; r++) {
    let s = 0;
    for (let i = 0; i < nv; i++) s += Math.abs(J0[r * nv + i]! - Jfd[r * nv + i]!);
    worst = Math.max(worst, s);
  }
  return worst;
}

/** Run a task's assembleInto against fresh zeroed H, c. */
function assembleOne(task: Task): { H: Float64Array; c: Float64Array } {
  const nv = config.nv;
  const H = new Float64Array(nv * nv);
  const c = new Float64Array(nv);
  task.assembleInto(H, c, config);
  return { H, c };
}

function expectClose(a: Float64Array, b: Float64Array, rtol: number, atol: number, what: string) {
  expect(a.length, what).toBe(b.length);
  for (let i = 0; i < a.length; i++) {
    const tol = atol + rtol * Math.max(Math.abs(a[i]!), Math.abs(b[i]!));
    expect(Math.abs(a[i]! - b[i]!), `${what}[${i}]`).toBeLessThanOrEqual(tol);
  }
}

// mink test_jacobians.py: _TOL = 1e-5, _STEP_SIZE = sqrt(eps). The √eps step
// survives the WASM roundtrip here (all-float64, deterministic kinematics).
const FD_TOL = 1e-5;
const FD_STEP = Math.sqrt(Number.EPSILON);
const N_CONFIGS = 5;

describe('finite-difference Jacobians (port of test_jacobians.py)', () => {
  it('FrameTask on geom hand_right matches FD at 5 in-limit random configs', () => {
    const rng = mulberry32(42);
    const task = new FrameTask('geom', config.geomId('hand_right'), 1, 1);
    task.setTarget(SE3.sampleUniform(rng));
    for (let n = 0; n < N_CONFIGS; n++) {
      const err = fdJacobianError(task, randomQ(rng), FD_STEP);
      expect(err, `config ${n}`).toBeLessThan(FD_TOL);
    }
  }, 60_000);

  it('PostureTask (jittered library-pose target) matches FD', () => {
    const rng = mulberry32(1234);
    const task = new PostureTask(config, 1);
    const target = baseQ();
    for (let i = 0; i < target.length; i++) target[i] = target[i]! + (2 * rng() - 1) * 1e-3;
    task.setTarget(target);
    for (let n = 0; n < N_CONFIGS; n++) {
      const err = fdJacobianError(task, randomQ(rng), FD_STEP);
      expect(err, `config ${n}`).toBeLessThan(FD_TOL);
    }
  }, 60_000);

  it('ComTask (target origin) matches FD', () => {
    const rng = mulberry32(2026);
    const task = new ComTask(1);
    task.setTarget([0, 0, 0]);
    for (let n = 0; n < N_CONFIGS; n++) {
      const err = fdJacobianError(task, randomQ(rng), FD_STEP);
      expect(err, `config ${n}`).toBeLessThan(FD_TOL);
    }
  }, 60_000);
});

describe('unit-cost/gain assembly identities (task.py _assemble_qp)', () => {
  it('FrameTask with cost 1, gain 1, lm 0: H == JᵀJ and c == eᵀJ', () => {
    config.update(baseQ());
    const task = new FrameTask('geom', config.geomId('hand_right'), 1, 1);
    // Target = current pose ∘ translate [0, 0.01, 0] (small nonzero error).
    const frame = config.getFrameTransform('geom', task.frameId);
    task.setTarget(SE3.multiply(frame, SE3.fromRotationTranslation(SO3.identity(), [0, 0.01, 0])));

    const { H, c } = assembleOne(task);
    const e = task.computeError(config);
    const J = task.computeJacobian(config);
    const nv = config.nv;
    const refH = new Float64Array(nv * nv);
    const refC = new Float64Array(nv);
    for (let a = 0; a < nv; a++) {
      for (let b = 0; b < nv; b++) {
        let s = 0;
        for (let i = 0; i < 6; i++) s += J[i * nv + a]! * J[i * nv + b]!;
        refH[a * nv + b] = s;
      }
    }
    for (let j = 0; j < nv; j++) {
      let s = 0;
      for (let i = 0; i < 6; i++) s += e[i]! * J[i * nv + j]!;
      refC[j] = s;
    }
    expectClose(H, refH, 1e-7, 1e-14, 'H');
    expectClose(c, refC, 1e-7, 1e-14, 'c');
  });

  it('PostureTask with cost 1 at a perturbed q: H == JᵀJ, c == eᵀJ', () => {
    const rng = mulberry32(7);
    const task = new PostureTask(config, 1);
    task.setTarget(baseQ());
    config.update(randomQ(rng));
    const { H, c } = assembleOne(task);
    const e = task.computeError(config);
    const J = task.computeJacobian(config);
    const nv = config.nv;
    const refH = new Float64Array(nv * nv);
    const refC = new Float64Array(nv);
    for (let a = 0; a < nv; a++) {
      for (let b = 0; b < nv; b++) {
        let s = 0;
        for (let i = 0; i < nv; i++) s += J[i * nv + a]! * J[i * nv + b]!;
        refH[a * nv + b] = s;
      }
      let s = 0;
      for (let i = 0; i < nv; i++) s += e[i]! * J[i * nv + a]!;
      refC[a] = s;
    }
    expectClose(H, refH, 1e-7, 1e-14, 'H');
    expectClose(c, refC, 1e-7, 1e-14, 'c');
    config.update(baseQ());
  });
});

describe('Levenberg-Marquardt damping (μ = lmDamping·(We·We))', () => {
  it('has zero effect when the task is at its target', () => {
    config.update(baseQ());
    const plain = new FrameTask('geom', config.geomId('hand_right'), 1, 1);
    plain.setTargetFromConfiguration(config);
    const damped = new FrameTask('geom', config.geomId('hand_right'), 1, 1, 1, 1e-2);
    damped.setTargetFromConfiguration(config);
    const a = assembleOne(plain);
    const b = assembleOne(damped);
    expectClose(a.H, b.H, 0, 1e-10, 'H at target');
    expectClose(a.c, b.c, 0, 1e-10, 'c at target');
  });

  it('adds exactly μ·I at nonzero error', () => {
    config.update(baseQ());
    const lm = 1e-2;
    const frame = config.getFrameTransform('geom', config.geomId('hand_right'));
    const target = SE3.multiply(frame, SE3.fromRotationTranslation(SO3.identity(), [0, 0.05, 0]));
    const plain = new FrameTask('geom', config.geomId('hand_right'), 1, 1);
    plain.setTarget(target);
    const damped = new FrameTask('geom', config.geomId('hand_right'), 1, 1, 1, lm);
    damped.setTarget(target);

    const e = plain.computeError(config);
    let weSq = 0;
    for (let i = 0; i < 6; i++) weSq += e[i]! * e[i]!; // cost 1, gain 1 ⇒ We = −e
    const mu = lm * weSq;
    expect(mu).toBeGreaterThan(0);

    const a = assembleOne(plain);
    const b = assembleOne(damped);
    const nv = config.nv;
    for (let i = 0; i < nv; i++) a.H[i * nv + i] = a.H[i * nv + i]! + mu;
    expectClose(b.H, a.H, 0, 1e-10, 'H + μI');
    expectClose(b.c, a.c, 0, 1e-10, 'c (unchanged by μ)');
  });
});

describe('task-specific structure', () => {
  it('ComTask error is zero when targeting the current subtree_com[1]', () => {
    config.update(baseQ());
    const task = new ComTask(1);
    task.setTargetFromConfiguration(config);
    const e = task.computeError(config);
    for (let i = 0; i < 3; i++) expect(Math.abs(e[i]!)).toBeLessThanOrEqual(1e-15);
  });

  it('PostureTask Jacobian is I_nv with free-joint columns zeroed', () => {
    const task = new PostureTask(config, 1);
    task.setTarget(baseQ());
    const J = task.computeJacobian(config);
    const nv = config.nv;
    const free = new Set(config.freeJointVIds);
    for (let r = 0; r < nv; r++) {
      for (let c2 = 0; c2 < nv; c2++) {
        const want = r === c2 && !free.has(c2) ? 1 : 0;
        expect(J[r * nv + c2], `J[${r}][${c2}]`).toBe(want);
      }
    }
    // Our scene: root dofs 0..5 and ball dofs 27..32 are the free slots.
    expect([...config.freeJointVIds]).toEqual([0, 1, 2, 3, 4, 5, 27, 28, 29, 30, 31, 32]);
  });

  it('PostureTask error is zero at its own target q', () => {
    config.update(baseQ());
    const task = new PostureTask(config, 1);
    task.setTargetFromConfiguration(config);
    const e = task.computeError(config);
    for (let i = 0; i < e.length; i++) expect(Math.abs(e[i]!)).toBeLessThanOrEqual(1e-15);
  });

  it('hinge error sign is current ⊖ target, and a root-quaternion perturbation stays finite', () => {
    const q0 = baseQ();
    config.update(q0);
    const task = new PostureTask(config, 1);
    task.setTarget(q0);

    // Sign: bump one hinge by +0.05 ⇒ e[dof] = current − target = +0.05.
    const j = config.hingeJointIds[0]!;
    const qBump = baseQ();
    qBump[config.jntQposadr[j]!] = qBump[config.jntQposadr[j]!]! + 0.05;
    config.update(qBump);
    const eBump = task.computeError(config);
    expect(eBump[config.jntDofadr[j]!]!).toBeCloseTo(0.05, 10);

    // Root-quaternion perturbation: rotate the root by 0.2 rad about x.
    config.update(q0);
    const basis = new Float64Array(config.nv);
    basis[3] = 1; // root angular-x tangent slot
    const qRot = config.integrate(basis, 0.2);
    config.update(qRot);
    const eRot = task.computeError(config);
    for (let i = 0; i < eRot.length; i++) expect(Number.isFinite(eRot[i]!)).toBe(true);
    // Free-joint slots are zeroed by the task; hinges are untouched by the root spin.
    for (const i of config.freeJointVIds) expect(eRot[i]).toBe(0);
    for (const jj of config.hingeJointIds) {
      expect(Math.abs(eRot[config.jntDofadr[jj]!]!)).toBeLessThanOrEqual(1e-12);
    }

    // The underlying quaternion ⊖ (mj_differentiatePos, qpos1=target,
    // qpos2=current): the root angular slot recovers +0.2 about x.
    const { mj, model } = engine;
    const qvelBuf = new mj.DoubleBuffer(config.nv) as { GetView(): Float64Array; delete(): void };
    try {
      mj.mj_differentiatePos(model, qvelBuf, 1.0, Array.from(q0), Array.from(qRot));
      const dq = Float64Array.from(qvelBuf.GetView());
      expect(dq[3]!).toBeCloseTo(0.2, 8);
      expect(Math.abs(dq[4]!)).toBeLessThanOrEqual(1e-10);
      expect(Math.abs(dq[5]!)).toBeLessThanOrEqual(1e-10);
    } finally {
      qvelBuf.delete();
    }
    config.update(q0);
  });
});
