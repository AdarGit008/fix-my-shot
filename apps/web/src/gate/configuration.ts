/* Configuration wrapper for the physical-validity gate projection (issue #9).
 *
 * Ported from kevinzakka/mink, src/mink/configuration.py (plus
 * get_freejoint_dims from src/mink/utils.py), pinned commit
 * 44c8a6ab66d27d06249f9018334a51662605e3e4.
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
 * - Wraps a GateEngine (engine.ts) instead of owning MjData; frames are
 *   addressed by pre-resolved integer id + 'body' | 'geom' type (no name
 *   resolution per call — helpers bodyId/geomId/jointId resolve once).
 * - update() skips mj_makeConstraint: our scene has neq == 0 (asserted at
 *   construction), so the upstream `if model.neq > 0` branch is dead here.
 * - integrate() routes through an Embind DoubleBuffer (mj_integratePos takes a
 *   writable buffer); the result is copied out before the buffer is deleted.
 * - get_frame_jacobian's world-aligned → body-frame conversion is done
 *   directly as J_body = [R_wfᵀ·jacp; R_wfᵀ·jacr]: upstream left-multiplies by
 *   the adjoint of the rotation-only inverse transform, which with zero
 *   translation is exactly blockdiag(R_wfᵀ, R_wfᵀ).
 * - check_limits returns a violation list instead of raising; it checks hinge
 *   joints only (jnt_type == 3). model.jnt_limited is NOT read — the Embind
 *   view throws a BindingError at runtime — and every hinge in our scene has
 *   an authored range, so the hinge test is equivalent for this model.
 * - Model constants (nq, nv, jnt_*) are copied ONCE at construction into plain
 *   JS arrays: model arrays never change, and typed-array views into the WASM
 *   heap detach on heap growth, so nothing WASM-backed is cached as a view.
 * - subtreeCom/jacSubtreeCom helpers are added here (used by ComTask and the
 *   custom ComSupportLimit) so the DoubleBuffer plumbing lives in one place.
 * - Dropped: keyframes, inertia matrix, relative transforms, native-lie paths.
 */

import { HandleRegistry } from '../spike/handles';
import type { GateEngine } from './engine';
import { SE3, SO3 } from './lie';

/** Frame kinds the gate needs (upstream also supports sites; our scene has none). */
export type FrameType = 'body' | 'geom';

/** One joint-limit violation from {@link GateConfiguration.checkLimits}. */
export interface LimitViolation {
  jointId: number;
  value: number;
  lower: number;
  upper: number;
}

const MJ_JNT_FREE = 0; // mjtJoint.mjJNT_FREE
const MJ_JNT_HINGE = 3; // mjtJoint.mjJNT_HINGE

/**
 * Encapsulates the gate engine's model+data for kinematic queries: forward
 * kinematics, frame transforms/Jacobians, velocity integration, limit checks.
 *
 * NOTE on views: every model/data array is re-acquired from the engine per
 * call — typed-array views into the WASM heap detach when the heap grows, so
 * caching one across calls is a correctness bug, not an optimization. The
 * persistent DoubleBuffers below are safe to keep (their heap *pointers* are
 * stable under Emscripten heap growth); only their views are re-taken.
 */
export class GateConfiguration {
  readonly engine: GateEngine;
  readonly nq: number;
  readonly nv: number;
  readonly njnt: number;
  /** mjtJoint per joint (plain array, copied once). */
  readonly jntType: readonly number[];
  readonly jntQposadr: readonly number[];
  readonly jntDofadr: readonly number[];
  /** (njnt, 2) ranges, flattened row-major. */
  readonly jntRange: readonly number[];
  /** Joint ids of every hinge joint (all 21 carry authored ranges). */
  readonly hingeJointIds: readonly number[];
  /** qpos slots covered by free joints (root 0..6, ball 28..34 for our scene). */
  readonly freeJointQIds: readonly number[];
  /** Tangent (dof) slots covered by free joints (root 0..5, ball 27..32). */
  readonly freeJointVIds: readonly number[];

  readonly #registry = new HandleRegistry();
  readonly #jacp: { GetView(): Float64Array };
  readonly #jacr: { GetView(): Float64Array };
  readonly #jacCom: { GetView(): Float64Array };

  constructor(engine: GateEngine, q?: ArrayLike<number>) {
    this.engine = engine;
    const { mj, model } = engine;
    this.nq = model.nq as number;
    this.nv = model.nv as number;
    this.njnt = model.njnt as number;
    if ((model.neq as number) !== 0) {
      // Upstream calls mj_makeConstraint when neq > 0; we ported without it
      // because this scene defines no equality constraints. Fail loud if that
      // assumption ever breaks instead of silently returning stale eq data.
      throw new Error(`GateConfiguration: expected neq == 0, got ${model.neq}`);
    }
    // Copy model constants out of the (detachable) views exactly once.
    this.jntType = Array.from(model.jnt_type as ArrayLike<number>);
    this.jntQposadr = Array.from(model.jnt_qposadr as ArrayLike<number>);
    this.jntDofadr = Array.from(model.jnt_dofadr as ArrayLike<number>);
    this.jntRange = Array.from(model.jnt_range as ArrayLike<number>);
    const hinges: number[] = [];
    const freeQ: number[] = [];
    const freeV: number[] = [];
    for (let j = 0; j < this.njnt; j++) {
      const type = this.jntType[j]!;
      if (type === MJ_JNT_HINGE) hinges.push(j);
      if (type === MJ_JNT_FREE) {
        const qadr = this.jntQposadr[j]!;
        const vadr = this.jntDofadr[j]!;
        for (let k = 0; k < 7; k++) freeQ.push(qadr + k);
        for (let k = 0; k < 6; k++) freeV.push(vadr + k);
      }
    }
    this.hingeJointIds = hinges;
    this.freeJointQIds = freeQ;
    this.freeJointVIds = freeV;

    this.#jacp = this.#registry.track(new mj.DoubleBuffer(3 * this.nv), 'jacp');
    this.#jacr = this.#registry.track(new mj.DoubleBuffer(3 * this.nv), 'jacr');
    this.#jacCom = this.#registry.track(new mj.DoubleBuffer(3 * this.nv), 'jacCom');

    this.update(q);
  }

  /** Free the persistent Jacobian buffers. Idempotent. */
  dispose(): void {
    this.#registry.disposeAll();
  }

  /** Current configuration vector, copied out of the WASM heap. */
  get q(): Float64Array {
    return Float64Array.from(this.engine.data.qpos as ArrayLike<number>);
  }

  /**
   * Run forward kinematics (mj_kinematics + mj_comPos), optionally overriding
   * data.qpos with `q` first. mj_comPos is required for up-to-date Jacobians
   * and subtree_com. mj_makeConstraint is skipped (neq == 0, see constructor).
   */
  update(q?: ArrayLike<number>): void {
    const { mj, model, data } = this.engine;
    if (q !== undefined) {
      if (q.length !== this.nq) {
        throw new Error(`update: qpos has length ${q.length}, model expects nq=${this.nq}`);
      }
      // Re-acquire the qpos view per call; never cache it across calls.
      (data.qpos as Float64Array).set(q as ArrayLike<number>);
    }
    mj.mj_kinematics(model, data);
    mj.mj_comPos(model, data);
  }

  /** q' = qpos ⊕ v·dt (free-joint quaternions handled by mj_integratePos). */
  integrate(velocity: ArrayLike<number>, dt: number): Float64Array {
    const { mj, model } = this.engine;
    if (velocity.length !== this.nv) {
      throw new Error(`integrate: velocity has length ${velocity.length}, expected nv=${this.nv}`);
    }
    const qbuf = mj.DoubleBuffer.FromArray(Array.from(this.q)) as {
      GetView(): Float64Array;
      delete(): void;
    };
    try {
      mj.mj_integratePos(model, qbuf, Array.from(velocity), dt);
      // Copy out of the view before any further WASM allocation can detach it.
      return Float64Array.from(qbuf.GetView());
    } finally {
      qbuf.delete();
    }
  }

  /** Integrate v·dt into data.qpos and re-run forward kinematics. */
  integrateInplace(velocity: ArrayLike<number>, dt: number): void {
    this.update(this.integrate(velocity, dt));
  }

  /** World pose of a body/geom frame from data.xpos/xmat (row-major 3×3). */
  getFrameTransform(frameType: FrameType, id: number): SE3 {
    const { data } = this.engine;
    const xpos = (frameType === 'body' ? data.xpos : data.geom_xpos) as ArrayLike<number>;
    const xmat = (frameType === 'body' ? data.xmat : data.geom_xmat) as ArrayLike<number>;
    const m = new Float64Array(9);
    for (let i = 0; i < 9; i++) m[i] = xmat[9 * id + i] as number;
    return SE3.fromRotationTranslation(SO3.fromMatrix(m), [
      xpos[3 * id] as number,
      xpos[3 * id + 1] as number,
      xpos[3 * id + 2] as number,
    ]);
  }

  /**
   * Body-frame Jacobian {}_B J_WB of the frame, 6×nv row-major with
   * translation rows first. MuJoCo's mj_jacBody/mj_jacGeom return the
   * local-point *world-aligned* Jacobian; the body-frame Jacobian is
   * J_body = blockdiag(R_wfᵀ, R_wfᵀ)·[jacp; jacr] (the adjoint of the
   * rotation-only inverse transform, as upstream builds it).
   */
  getFrameJacobian(frameType: FrameType, id: number): Float64Array {
    const { mj, model, data } = this.engine;
    if (frameType === 'body') {
      mj.mj_jacBody(model, data, this.#jacp, this.#jacr, id);
    } else {
      mj.mj_jacGeom(model, data, this.#jacp, this.#jacr, id);
    }
    const nv = this.nv;
    const jacp = this.#jacp.GetView();
    const jacr = this.#jacr.GetView();
    const xmat = (frameType === 'body' ? data.xmat : data.geom_xmat) as ArrayLike<number>;
    const out = new Float64Array(6 * nv);
    // out[r] = Σ_k R[k][r]·jac[k]  (left-multiplying by R_wfᵀ).
    for (let r = 0; r < 3; r++) {
      const r0 = xmat[9 * id + r] as number; // R[0][r]
      const r1 = xmat[9 * id + 3 + r] as number; // R[1][r]
      const r2 = xmat[9 * id + 6 + r] as number; // R[2][r]
      for (let c = 0; c < nv; c++) {
        out[r * nv + c] = r0 * jacp[c]! + r1 * jacp[nv + c]! + r2 * jacp[2 * nv + c]!;
        out[(r + 3) * nv + c] = r0 * jacr[c]! + r1 * jacr[nv + c]! + r2 * jacr[2 * nv + c]!;
      }
    }
    return out;
  }

  /** subtree_com row for `bodyId` as a fresh 3-vector. Row 1 = humanoid torso
   * subtree (the ball is a separate top-level body and is NOT included). */
  subtreeCom(bodyId: number): Float64Array {
    const com = this.engine.data.subtree_com as ArrayLike<number>;
    return new Float64Array([
      com[3 * bodyId] as number,
      com[3 * bodyId + 1] as number,
      com[3 * bodyId + 2] as number,
    ]);
  }

  /** mj_jacSubtreeCom for `bodyId`, 3×nv row-major (translation only). */
  jacSubtreeCom(bodyId: number): Float64Array {
    const { mj, model, data } = this.engine;
    mj.mj_jacSubtreeCom(model, data, this.#jacCom, bodyId);
    return Float64Array.from(this.#jacCom.GetView());
  }

  /**
   * Hinge joints outside [range0 − tol, range1 + tol]. Free/ball joints are
   * unchecked (upstream also skips free joints; see header note on
   * jnt_limited).
   */
  checkLimits(tol = 1e-6): LimitViolation[] {
    const qpos = this.engine.data.qpos as ArrayLike<number>;
    const violations: LimitViolation[] = [];
    for (const j of this.hingeJointIds) {
      const value = qpos[this.jntQposadr[j]!] as number;
      const lower = this.jntRange[2 * j]!;
      const upper = this.jntRange[2 * j + 1]!;
      if (value < lower - tol || value > upper + tol) {
        violations.push({ jointId: j, value, lower, upper });
      }
    }
    return violations;
  }

  /** Resolve a body name to its id (throws when missing). */
  bodyId(name: string): number {
    return this.#nameToId(name, this.engine.mj.mjtObj.mjOBJ_BODY.value as number, 'body');
  }

  /** Resolve a geom name to its id (throws when missing). */
  geomId(name: string): number {
    return this.#nameToId(name, this.engine.mj.mjtObj.mjOBJ_GEOM.value as number, 'geom');
  }

  /** Resolve a joint name to its id (throws when missing). */
  jointId(name: string): number {
    return this.#nameToId(name, this.engine.mj.mjtObj.mjOBJ_JOINT.value as number, 'joint');
  }

  #nameToId(name: string, objType: number, kind: string): number {
    const id = this.engine.mj.mj_name2id(this.engine.model, objType, name);
    if (id < 0) throw new Error(`GateConfiguration: ${kind} '${name}' missing from model`);
    return id;
  }
}
