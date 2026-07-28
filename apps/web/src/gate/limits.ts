/* Kinematic limits for the physical-validity gate projection (issue #9).
 *
 * ConfigurationLimit, VelocityLimit and CollisionAvoidanceLimit are ported
 * from kevinzakka/mink, src/mink/limits/{limit,configuration_limit,
 * velocity_limit,collision_avoidance_limit}.py, pinned commit
 * 44c8a6ab66d27d06249f9018334a51662605e3e4. ComSupportLimit is ORIGINAL work
 * (not from mink) — see its own doc comment.
 *
 * ── Upstream licence (for the three ported limits) ────────────────────
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
 * - Constraint NamedTuple becomes `QpInequalities | null` (null = inactive).
 * - CONSTRAINT SPACE: all G, h live in Δq space — the QP variable is the
 *   configuration displacement Δq (mink build_ik: G·Δq ≤ h; v = Δq/dt after
 *   the solve). ConfigurationLimit and ComSupportLimit are genuinely
 *   dt-invariant displacement bounds. CollisionAvoidanceLimit's h, however,
 *   is ported bit-for-bit from upstream and carries a 1/dt factor
 *   (h = gain·(dist−minDist)/dt): upstream expresses the velocity-damper
 *   bound in VELOCITY units but applies it to the Δq-space QP, so for dt < 1
 *   the constraint is looser (by 1/dt) than the displacement-space damper
 *   n·JΔq ≤ gain·(dist−minDist) would be. This upstream inconsistency is
 *   preserved deliberately for oracle fidelity.
 * - ConfigurationLimit applies to limited non-free joints, which for this
 *   scene is exactly the 21 hinge joints (dofs 6..26; derived from cached
 *   jnt_type/jnt_dofadr, not hardcoded). model.jnt_limited is NOT read (the
 *   Embind view throws BindingError; every hinge here has an authored range).
 *   Upstream routes q ⊖ bound through mj_differentiatePos to handle
 *   quaternion joints; our limited joints are all hinge scalars, so the
 *   subtraction is done directly — identical values for hinges. `lower` and
 *   `upper` are per-selected-joint arrays (not nq-wide), overridable by tests
 *   exactly like upstream's test suite overrides limit.lower/upper.
 * - CollisionAvoidanceLimit keeps upstream's exact narrow-phase loop, G-row
 *   and h construction (including h = +∞ / zero G-rows for skipped pairs and
 *   the sign flip when dist < 0). Pairs are given as flat [geom, geom] pairs
 *   (id or name) instead of geom-group products; the same (min,max)
 *   normalization, weld / parent-child / contype-conaffinity filters and
 *   deduplication are applied. The vectorized broadphase is dropped (our
 *   pair counts are tiny; upstream's own fallback is this same linear scan).
 * - mju_normalize3's small-norm guard (reset to (1,0,0) below mjMINVAL) is
 *   inlined in the normal computation.
 */

import { convexHull, footprint, type Vec2 } from './check';
import type { GateConfiguration } from './configuration';

/** Linear inequalities G·Δq ≤ h; G is count×nv row-major. */
export interface QpInequalities {
  G: Float64Array;
  h: Float64Array;
  count: number;
}

/** A kinematic limit contributing inequality rows to the IK QP. */
export interface Limit {
  /** Returns the limit's rows at the current configuration, or null when the
   * limit is inactive. */
  computeQpInequalities(configuration: GateConfiguration, dt: number): QpInequalities | null;
}

const MJ_JNT_FREE = 0; // mjtJoint.mjJNT_FREE
const MJ_MINVAL = 1e-15; // mjMINVAL (mju_normalize3's small-norm guard)

/**
 * Inequality constraint on joint positions: gain·(q ⊖ lower) and
 * gain·(upper ⊖ q) bound Δq on each limited dof. Free joints are ignored.
 * dt-INVARIANT: the bound is a displacement, so dt never enters.
 */
export class ConfigurationLimit implements Limit {
  /** Tangent (dof) indices of the limited joints (our 21 hinges: 6..26). */
  readonly indices: readonly number[];
  /** qpos addresses parallel to `indices`. */
  readonly qposadrs: readonly number[];
  /** Effective lower bounds (range0 + minDistanceFromLimits), overridable. */
  readonly lower: Float64Array;
  /** Effective upper bounds (range1 − minDistanceFromLimits), overridable. */
  readonly upper: Float64Array;
  readonly gain: number;

  constructor(configuration: GateConfiguration, gain = 0.95, minDistanceFromLimits = 0) {
    if (!(gain > 0 && gain <= 1)) {
      throw new Error('ConfigurationLimit: gain must be in the range (0, 1]');
    }
    const indices: number[] = [];
    const qposadrs: number[] = [];
    const lower: number[] = [];
    const upper: number[] = [];
    for (let j = 0; j < configuration.njnt; j++) {
      const type = configuration.jntType[j]!;
      // Skip free joints and joints without limits (here: only hinges are
      // limited; ball joints do not occur limited in this scene).
      if (type === MJ_JNT_FREE || !configuration.hingeJointIds.includes(j)) continue;
      indices.push(configuration.jntDofadr[j]!);
      qposadrs.push(configuration.jntQposadr[j]!);
      lower.push(configuration.jntRange[2 * j]! + minDistanceFromLimits);
      upper.push(configuration.jntRange[2 * j + 1]! - minDistanceFromLimits);
    }
    this.indices = indices;
    this.qposadrs = qposadrs;
    this.lower = Float64Array.from(lower);
    this.upper = Float64Array.from(upper);
    this.gain = gain;
  }

  computeQpInequalities(configuration: GateConfiguration, _dt: number): QpInequalities | null {
    void _dt; // Unused: the bound lives in Δq space (dt-invariant), as upstream.
    const nb = this.indices.length;
    if (nb === 0) return null;
    const nv = configuration.nv;
    const q = configuration.q;
    const G = new Float64Array(2 * nb * nv);
    const h = new Float64Array(2 * nb);
    for (let i = 0; i < nb; i++) {
      const dof = this.indices[i]!;
      const qi = q[this.qposadrs[i]!]!;
      G[i * nv + dof] = 1; // +P rows: Δq ≤ gain·(upper ⊖ q)
      G[(nb + i) * nv + dof] = -1; // −P rows: −Δq ≤ gain·(q ⊖ lower)
      h[i] = this.gain * (this.upper[i]! - qi);
      h[nb + i] = this.gain * (qi - this.lower[i]!);
    }
    return { G, h, count: 2 * nb };
  }
}

/**
 * Inequality constraint on joint velocities: |Δq| ≤ dt·vmax per limited dof.
 * Hinge joints only (free joints unsupported, as upstream).
 */
export class VelocityLimit implements Limit {
  readonly indices: readonly number[];
  readonly limit: Float64Array;

  constructor(configuration: GateConfiguration, velocities: Readonly<Record<string, number>>) {
    const indices: number[] = [];
    const limits: number[] = [];
    for (const [name, maxVel] of Object.entries(velocities)) {
      const jid = configuration.jointId(name);
      const type = configuration.jntType[jid]!;
      if (type === MJ_JNT_FREE) {
        throw new Error(`VelocityLimit: free joint ${name} is not supported`);
      }
      if (!(maxVel >= 0)) throw new Error(`VelocityLimit: ${name} limit must be >= 0`);
      indices.push(configuration.jntDofadr[jid]!);
      limits.push(maxVel);
    }
    this.indices = indices;
    this.limit = Float64Array.from(limits);
  }

  computeQpInequalities(configuration: GateConfiguration, dt: number): QpInequalities | null {
    const nb = this.indices.length;
    if (nb === 0) return null;
    const nv = configuration.nv;
    const G = new Float64Array(2 * nb * nv);
    const h = new Float64Array(2 * nb);
    for (let i = 0; i < nb; i++) {
      const dof = this.indices[i]!;
      G[i * nv + dof] = 1;
      G[(nb + i) * nv + dof] = -1;
      h[i] = dt * this.limit[i]!;
      h[nb + i] = dt * this.limit[i]!;
    }
    return { G, h, count: 2 * nb };
  }
}

/** Options for {@link CollisionAvoidanceLimit} (upstream defaults). */
export interface CollisionAvoidanceOptions {
  gain?: number;
  minimumDistanceFromCollisions?: number;
  collisionDetectionDistance?: number;
  boundRelaxation?: number;
}

/**
 * Normal velocity-damper limit between geom pairs (upstream's exact
 * construction): for each pair with narrow-phase distance dist below the
 * detection distance, one row
 *   G = sign·(−normal·(J₂ − J₁)),  sign = −1 if dist ≥ 0 else +1 — i.e.
 *   G = −normal·(J₂−J₁) for separated geoms, flipped when penetrating —
 *   h = gain·(dist − minDist)/dt + relaxation  when dist > minDist,
 *   h = relaxation                              otherwise,
 * with normal = (fromto[3:] − fromto[:3]) normalized and J₁/J₂ the point
 * translation Jacobians at the two closest points. Rows for pairs beyond the
 * detection distance keep G = 0, h = +∞ (upstream's preallocated defaults).
 * See the file header for the Δq-vs-velocity space note on h's 1/dt factor.
 */
export class CollisionAvoidanceLimit implements Limit {
  readonly geomIdPairs: readonly (readonly [number, number])[];
  readonly gain: number;
  readonly minimumDistanceFromCollisions: number;
  readonly collisionDetectionDistance: number;
  readonly boundRelaxation: number;
  readonly #geomBodyid: readonly number[];

  constructor(
    configuration: GateConfiguration,
    geomPairs: readonly (readonly [number | string, number | string])[],
    options: CollisionAvoidanceOptions = {},
  ) {
    this.gain = options.gain ?? 0.85;
    this.minimumDistanceFromCollisions = options.minimumDistanceFromCollisions ?? 0.005;
    this.collisionDetectionDistance = options.collisionDetectionDistance ?? 0.01;
    this.boundRelaxation = options.boundRelaxation ?? 0;

    const model = configuration.engine.model;
    const geomBodyid = Array.from(model.geom_bodyid as ArrayLike<number>);
    const bodyWeldid = Array.from(model.body_weldid as ArrayLike<number>);
    const bodyParentid = Array.from(model.body_parentid as ArrayLike<number>);
    const geomContype = Array.from(model.geom_contype as ArrayLike<number>);
    const geomConaffinity = Array.from(model.geom_conaffinity as ArrayLike<number>);
    this.#geomBodyid = geomBodyid;

    const isWeldedTogether = (g1: number, g2: number): boolean =>
      bodyWeldid[geomBodyid[g1]!]! === bodyWeldid[geomBodyid[g2]!]!;
    const areParentChild = (g1: number, g2: number): boolean => {
      const weld1 = bodyWeldid[geomBodyid[g1]!]!;
      const weld2 = bodyWeldid[geomBodyid[g2]!]!;
      const weldParentWeld1 = bodyWeldid[bodyParentid[weld1]!]!;
      const weldParentWeld2 = bodyWeldid[bodyParentid[weld2]!]!;
      return weld1 === weldParentWeld2 || weld2 === weldParentWeld1;
    };
    const passesContypeConaffinity = (g1: number, g2: number): boolean =>
      (geomContype[g1]! & geomConaffinity[g2]!) !== 0 ||
      (geomContype[g2]! & geomConaffinity[g1]!) !== 0;

    const seen = new Set<string>();
    const pairs: [number, number][] = [];
    for (const [a, b] of geomPairs) {
      const ga = typeof a === 'number' ? a : configuration.geomId(a);
      const gb = typeof b === 'number' ? b : configuration.geomId(b);
      const lo = Math.min(ga, gb);
      const hi = Math.max(ga, gb);
      if (isWeldedTogether(lo, hi)) continue;
      if (areParentChild(lo, hi)) continue;
      if (!passesContypeConaffinity(lo, hi)) continue;
      const key = `${lo},${hi}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push([lo, hi]);
    }
    this.geomIdPairs = pairs;
  }

  computeQpInequalities(configuration: GateConfiguration, dt: number): QpInequalities | null {
    const count = this.geomIdPairs.length;
    if (count === 0) return null;
    const { mj, model, data } = configuration.engine;
    const nv = configuration.nv;
    const G = new Float64Array(count * nv); // zeros, as upstream's preallocation
    const h = new Float64Array(count).fill(Infinity);

    const fromtoBuf = new mj.DoubleBuffer(6) as { GetView(): Float64Array; delete(): void };
    const jac1Buf = new mj.DoubleBuffer(3 * nv) as { GetView(): Float64Array; delete(): void };
    const jac2Buf = new mj.DoubleBuffer(3 * nv) as { GetView(): Float64Array; delete(): void };
    try {
      for (let idx = 0; idx < count; idx++) {
        const [g1, g2] = this.geomIdPairs[idx]!;
        const dist = mj.mj_geomDistance(
          model,
          data,
          g1,
          g2,
          this.collisionDetectionDistance,
          fromtoBuf,
        );
        if (Math.abs(dist - this.collisionDetectionDistance) < 1e-12) continue;
        const fromto = Array.from(fromtoBuf.GetView());
        // normal = fromto[3:] − fromto[:3], normalized (mju_normalize3 guard).
        let nx = fromto[3]! - fromto[0]!;
        let ny = fromto[4]! - fromto[1]!;
        let nz = fromto[5]! - fromto[2]!;
        const norm = Math.hypot(nx, ny, nz);
        if (norm < MJ_MINVAL) {
          nx = 1;
          ny = 0;
          nz = 0;
        } else {
          nx /= norm;
          ny /= norm;
          nz /= norm;
        }
        // Point translation Jacobians at the two closest points.
        mj.mj_jac(
          model,
          data,
          jac2Buf,
          null,
          [fromto[3]!, fromto[4]!, fromto[5]!],
          this.#geomBodyid[g2]!,
        );
        mj.mj_jac(
          model,
          data,
          jac1Buf,
          null,
          [fromto[0]!, fromto[1]!, fromto[2]!],
          this.#geomBodyid[g1]!,
        );
        const jac1 = jac1Buf.GetView();
        const jac2 = jac2Buf.GetView();
        if (dist > this.minimumDistanceFromCollisions) {
          h[idx] =
            (this.gain * (dist - this.minimumDistanceFromCollisions)) / dt + this.boundRelaxation;
        } else {
          h[idx] = this.boundRelaxation;
        }
        const sign = dist >= 0 ? -1 : 1;
        for (let c = 0; c < nv; c++) {
          const dx = jac2[c]! - jac1[c]!;
          const dy = jac2[nv + c]! - jac1[nv + c]!;
          const dz = jac2[2 * nv + c]! - jac1[2 * nv + c]!;
          G[idx * nv + c] = sign * (nx * dx + ny * dy + nz * dz);
        }
      }
    } finally {
      jac2Buf.delete();
      jac1Buf.delete();
      fromtoBuf.delete();
    }
    return { G, h, count };
  }
}

/** Options for {@link ComSupportLimit}. */
export interface ComSupportOptions {
  gain?: number;
  /** Test seam: override the support-footprint construction. Defaults to
   * check.ts's foot-capsule-endpoint footprint. */
  footprintFn?: (configuration: GateConfiguration) => Vec2[];
}

/**
 * ComSupportLimit — ORIGINAL work, NOT ported from mink (plain header, no
 * upstream attribution): keeps the projected center of mass inside the foot
 * support polygon during projection steps.
 *
 * Formulation (Δq space, dt-invariant): with the CCW support hull from
 * check.ts's footprint construction, each edge p_i → p_j contributes an
 * outward normal nᵢ = [dy, −dx]/‖d‖ (d = p_j − p_i) and the inequality
 * nᵢ·com_new ≤ nᵢ·p_i where com_new = com_xy + (J_com·Δq)_xy. As a QP row:
 * G = nᵢ·J_com[0:2], h = gain·(nᵢ·p_i − nᵢ·com_xy), gain = 0.95.
 *
 * COM source: subtree_com row 1 with J_com = mj_jacSubtreeCom(body 1) — the
 * HUMANOID-ONLY mass (the ball is a separate top-level body, ~1.5% of total
 * mass), whereas check.ts's authority check uses the world COM (row 0,
 * including the ball). The mismatch is a known ~1.5%-mass approximation; the
 * post-solve check.ts evaluation remains the authority.
 *
 * Degenerate hull (< 3 vertices, e.g. collinear feet): returns an
 * INFEASIBLE MARKER — a single all-zero G row with h = −1 (0 ≤ −1 is
 * unsatisfiable), so the QP reports found=false and the caller rejects.
 */
export class ComSupportLimit implements Limit {
  readonly gain: number;
  readonly #footprintFn: (configuration: GateConfiguration) => Vec2[];

  constructor(options: ComSupportOptions = {}) {
    this.gain = options.gain ?? 0.95;
    this.#footprintFn = options.footprintFn ?? ((c) => footprint(c.engine));
  }

  computeQpInequalities(configuration: GateConfiguration, _dt: number): QpInequalities | null {
    void _dt; // dt-invariant: the bound lives in Δq (displacement) space.
    const nv = configuration.nv;
    const hull = convexHull(this.#footprintFn(configuration));
    if (hull.length < 3) {
      // Infeasible marker: 0·Δq ≤ −1 can never hold → solver returns found=false.
      return { G: new Float64Array(nv), h: Float64Array.of(-1), count: 1 };
    }
    const com = configuration.subtreeCom(1);
    const jacCom = configuration.jacSubtreeCom(1); // 3×nv; rows 0-1 are xy
    const count = hull.length;
    const G = new Float64Array(count * nv);
    const h = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      const p = hull[i]!;
      const pNext = hull[(i + 1) % count]!;
      const dx = pNext[0] - p[0];
      const dy = pNext[1] - p[1];
      const len = Math.hypot(dx, dy);
      // CCW hull edge → outward normal is d rotated by −90°: [dy, −dx].
      const nx = dy / len;
      const ny = -dx / len;
      for (let c = 0; c < nv; c++) {
        G[i * nv + c] = nx * jacCom[c]! + ny * jacCom[nv + c]!;
      }
      h[i] = this.gain * (nx * (p[0] - com[0]!) + ny * (p[1] - com[1]!));
    }
    return { G, h, count };
  }
}
