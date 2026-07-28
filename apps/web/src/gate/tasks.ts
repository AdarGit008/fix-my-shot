/* Kinematic tasks for the physical-validity gate projection (issue #9).
 *
 * Ported from kevinzakka/mink, src/mink/tasks/{task,frame_task,posture_task,
 * com_task}.py, pinned commit 44c8a6ab66d27d06249f9018334a51662605e3e4.
 *
 * ── Upstream licence ──────────────────────────────────────────────────
 * Copyright 2024 Kevin Zakka
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *
 * Changes from upstream (Python/numpy/mujoco → TypeScript + mujoco WASM):
 * - Objective/compute_qp_objective become assembleInto(H, c): tasks accumulate
 *   H += WJᵀ·WJ + μ·I_nv and c += −Weᵀ·WJ directly into caller-owned dense
 *   row-major buffers. The weighting is upstream's _weighted_residual verbatim:
 *   We = cost∘(−gain·e), WJ = diag(cost)·J, μ = lmDamping·(We·We). The per-task
 *   μ is applied HERE and only here; solve.ts adds only the global damping —
 *   together this matches upstream's fused path (H.flat[::nv+1] += damping +
 *   Σμ) with μ counted exactly once.
 * - Frames are addressed by pre-resolved integer id + FrameType; targets are
 *   set via setTarget (no mocap/keyframe helpers, no cost re-validation
 *   setters beyond construction).
 * - PostureTask reads nv and the free-joint tangent slots from
 *   GateConfiguration's cached constants instead of get_freejoint_dims(model);
 *   its error routes through mj_differentiatePos with qpos1 = target and
 *   qpos2 = current, so e = current ⊖ target, exactly as upstream (which
 *   documents that mj_differentiatePos computes qpos2 ⊖ qpos1).
 * - ComTask keeps upstream's hardcoded subtree index 1. NOTE for this scene:
 *   subtree 1 is the torso subtree, i.e. the HUMANOID-ONLY center of mass —
 *   the basketball is a separate top-level body (subtree of body 0 only), so
 *   this COM differs from check.ts's world COM (subtree_com row 0, which
 *   includes the ~1.5%-of-total-mass ball). check.ts stays the authority.
 * - Dropped: the native-lie fast paths, exceptions module (plain Errors), and
 *   all tasks the gate does not use.
 */

import type { FrameType, GateConfiguration } from './configuration';
import { SE3 } from './lie';

/** Multiply row-major a (r×s) by b (s×c). */
function matMul(a: Float64Array, b: Float64Array, r: number, s: number, c: number): Float64Array {
  const out = new Float64Array(r * c);
  for (let i = 0; i < r; i++) {
    for (let k = 0; k < s; k++) {
      const aik = a[i * s + k]!;
      if (aik === 0) continue;
      for (let j = 0; j < c; j++) out[i * c + j] = out[i * c + j]! + aik * b[k * c + j]!;
    }
  }
  return out;
}

/**
 * Abstract kinematic task: drives error e(q) ∈ R^k to zero through the
 * first-order dynamics J(q)·Δq = −α·e(q), weighted by `cost` in the QP.
 */
export abstract class Task {
  /** Cost vector, one weight per error coordinate (length k). */
  readonly cost: Float64Array;
  /** Task gain α ∈ [0, 1]; 1 is dead-beat, lower low-pass filters the task. */
  readonly gain: number;
  /** Unitless Levenberg-Marquardt scale (active only at nonzero error). */
  readonly lmDamping: number;

  protected constructor(cost: Float64Array, gain: number, lmDamping: number) {
    if (!(gain >= 0 && gain <= 1)) throw new Error('Task: gain must be in the range [0, 1]');
    if (!(lmDamping >= 0)) throw new Error('Task: lmDamping must be >= 0');
    for (const w of cost) {
      if (!(w >= 0)) throw new Error('Task: cost must be >= 0');
    }
    this.cost = cost;
    this.gain = gain;
    this.lmDamping = lmDamping;
  }

  /** Task error e(q) at the configuration's current q (length k). */
  abstract computeError(configuration: GateConfiguration): Float64Array;

  /** Task Jacobian ∂e/∂q at the current q (k×nv row-major). */
  abstract computeJacobian(configuration: GateConfiguration): Float64Array;

  /**
   * Accumulate this task's QP contribution into H (nv×nv row-major) and
   * c (nv): H += WJᵀ·WJ + μ·I, c += −Weᵀ·WJ, with We = cost∘(−gain·e),
   * WJ = diag(cost)·J and μ = lmDamping·(We·We). With unit cost/gain and
   * zero lmDamping this reduces to H += JᵀJ, c += eᵀJ.
   */
  assembleInto(H: Float64Array, c: Float64Array, configuration: GateConfiguration): void {
    const e = this.computeError(configuration);
    const J = this.computeJacobian(configuration);
    const k = this.cost.length;
    const nv = configuration.nv;
    if (e.length !== k || J.length !== k * nv) {
      throw new Error(
        `Task: expected e(${k}) and J(${k}×${nv}), got e(${e.length}) J(${J.length})`,
      );
    }
    // Weighted residual (upstream _weighted_residual).
    const we = new Float64Array(k);
    let mu = 0;
    for (let i = 0; i < k; i++) {
      we[i] = this.cost[i]! * (-this.gain * e[i]!);
      mu += we[i]! * we[i]!;
    }
    mu *= this.lmDamping;
    const wj = new Float64Array(k * nv);
    for (let i = 0; i < k; i++) {
      const w = this.cost[i]!;
      for (let j = 0; j < nv; j++) wj[i * nv + j] = w * J[i * nv + j]!;
    }
    // H += WJᵀ·WJ + μ·I.
    for (let a = 0; a < nv; a++) {
      for (let b = a; b < nv; b++) {
        let s = 0;
        for (let i = 0; i < k; i++) s += wj[i * nv + a]! * wj[i * nv + b]!;
        H[a * nv + b] = H[a * nv + b]! + s;
        if (a !== b) H[b * nv + a] = H[b * nv + a]! + s;
      }
      H[a * nv + a] = H[a * nv + a]! + mu;
    }
    // c += −Weᵀ·WJ.
    for (let j = 0; j < nv; j++) {
      let s = 0;
      for (let i = 0; i < k; i++) s += we[i]! * wj[i * nv + j]!;
      c[j] = c[j]! - s;
    }
  }
}

/**
 * Regulate the pose of a robot frame toward a target pose in the world.
 * Error is the body twist e = T_target ⊖ T_frame = log(T_frame⁻¹ ∘ T_target),
 * translation-first; J = −jlog(T_tb)·J_body with T_tb = T_target⁻¹ ∘ T_frame.
 */
export class FrameTask extends Task {
  readonly frameType: FrameType;
  readonly frameId: number;
  #target: SE3 | null = null;

  constructor(
    frameType: FrameType,
    frameId: number,
    positionCost: number | ArrayLike<number>,
    orientationCost: number | ArrayLike<number>,
    gain = 1,
    lmDamping = 0,
  ) {
    const cost = new Float64Array(6);
    const fill = (value: number | ArrayLike<number>, offset: number, what: string) => {
      if (typeof value === 'number') {
        cost[offset] = cost[offset + 1] = cost[offset + 2] = value;
      } else if (value.length === 3) {
        for (let i = 0; i < 3; i++) cost[offset + i] = value[i]!;
      } else {
        throw new Error(`FrameTask: ${what} cost must be a scalar or 3-vector`);
      }
    };
    fill(positionCost, 0, 'position');
    fill(orientationCost, 3, 'orientation');
    super(cost, gain, lmDamping);
    this.frameType = frameType;
    this.frameId = frameId;
  }

  /** Set the target pose (transform from target frame to world). */
  setTarget(transformTargetToWorld: SE3): void {
    this.#target = { wxyzXyz: Float64Array.from(transformTargetToWorld.wxyzXyz) };
  }

  /** Set the target from the frame's current pose. */
  setTargetFromConfiguration(configuration: GateConfiguration): void {
    this.setTarget(configuration.getFrameTransform(this.frameType, this.frameId));
  }

  get target(): SE3 {
    if (!this.#target) throw new Error('FrameTask: target not set');
    return this.#target;
  }

  computeError(configuration: GateConfiguration): Float64Array {
    const frame = configuration.getFrameTransform(this.frameType, this.frameId);
    return SE3.rminus(this.target, frame);
  }

  computeJacobian(configuration: GateConfiguration): Float64Array {
    const frame = configuration.getFrameTransform(this.frameType, this.frameId);
    const jac = configuration.getFrameJacobian(this.frameType, this.frameId);
    const tTb = SE3.multiply(SE3.inverse(this.target), frame);
    const jlog = SE3.jlog(tTb);
    const out = matMul(jlog, jac, 6, 6, configuration.nv);
    for (let i = 0; i < out.length; i++) out[i] = -out[i]!;
    return out;
  }
}

/**
 * Regulate joint angles toward a target posture (a regularizer). Free-joint
 * coordinates are excluded: their error slots and Jacobian columns are zeroed.
 */
export class PostureTask extends Task {
  readonly #nq: number;
  readonly #nv: number;
  readonly #freeVIds: readonly number[];
  #targetQ: Float64Array | null = null;

  constructor(
    configuration: GateConfiguration,
    cost: number | ArrayLike<number>,
    gain = 1,
    lmDamping = 0,
  ) {
    const nv = configuration.nv;
    const costVec = new Float64Array(nv);
    if (typeof cost === 'number') {
      costVec.fill(cost);
    } else if (cost.length === nv) {
      costVec.set(cost as ArrayLike<number>);
    } else {
      throw new Error(`PostureTask: cost must be a scalar or ${nv}-vector`);
    }
    super(costVec, gain, lmDamping);
    this.#nq = configuration.nq;
    this.#nv = nv;
    this.#freeVIds = configuration.freeJointVIds;
  }

  /** Set the target posture (length nq; free-joint slots are ignored). */
  setTarget(targetQ: ArrayLike<number>): void {
    if (targetQ.length !== this.#nq) {
      throw new Error(`PostureTask: target has length ${targetQ.length}, expected nq=${this.#nq}`);
    }
    this.#targetQ = Float64Array.from(targetQ as ArrayLike<number>);
  }

  setTargetFromConfiguration(configuration: GateConfiguration): void {
    this.setTarget(configuration.q);
  }

  computeError(configuration: GateConfiguration): Float64Array {
    if (!this.#targetQ) throw new Error('PostureTask: target not set');
    const { mj, model } = configuration.engine;
    const qvelBuf = new mj.DoubleBuffer(this.#nv) as {
      GetView(): Float64Array;
      delete(): void;
    };
    try {
      // mj_differentiatePos computes qpos2 ⊖ qpos1, so with qpos1 = target and
      // qpos2 = current the error is e = current ⊖ target (as upstream).
      mj.mj_differentiatePos(
        model,
        qvelBuf,
        1.0,
        Array.from(this.#targetQ),
        Array.from(configuration.q),
      );
      const e = Float64Array.from(qvelBuf.GetView());
      for (const i of this.#freeVIds) e[i] = 0;
      return e;
    } finally {
      qvelBuf.delete();
    }
  }

  computeJacobian(configuration: GateConfiguration): Float64Array {
    const nv = configuration.nv;
    const jac = new Float64Array(nv * nv);
    for (let i = 0; i < nv; i++) jac[i * nv + i] = 1;
    for (const i of this.#freeVIds) {
      for (let r = 0; r < nv; r++) jac[r * nv + i] = 0;
    }
    return jac;
  }
}

/**
 * Regulate the center of mass of subtree 1 (upstream's hardcoded "the robot").
 * For this scene that is the HUMANOID-ONLY COM — see the header note; the
 * post-solve authority (check.ts) uses the world COM including the ball.
 */
export class ComTask extends Task {
  #targetCom: Float64Array | null = null;

  constructor(cost: number | ArrayLike<number>, gain = 1, lmDamping = 0) {
    const costVec = new Float64Array(3);
    if (typeof cost === 'number') {
      costVec.fill(cost);
    } else if (cost.length === 3) {
      costVec.set(cost as ArrayLike<number>);
    } else {
      throw new Error('ComTask: cost must be a scalar or 3-vector');
    }
    super(costVec, gain, lmDamping);
  }

  setTarget(targetCom: ArrayLike<number>): void {
    if (targetCom.length !== 3) throw new Error('ComTask: target must be a 3-vector');
    this.#targetCom = Float64Array.from(targetCom as ArrayLike<number>);
  }

  setTargetFromConfiguration(configuration: GateConfiguration): void {
    this.setTarget(configuration.subtreeCom(1));
  }

  computeError(configuration: GateConfiguration): Float64Array {
    if (!this.#targetCom) throw new Error('ComTask: target not set');
    const com = configuration.subtreeCom(1);
    for (let i = 0; i < 3; i++) com[i] = com[i]! - this.#targetCom[i]!;
    return com;
  }

  computeJacobian(configuration: GateConfiguration): Float64Array {
    return configuration.jacSubtreeCom(1);
  }
}
