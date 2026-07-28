// Physical-validity gate — the static authority classifier (issue #9, ADR-0009).
//
// Faithful TS transliteration of tools/posegen/gate.py (the three checks and
// their constants) plus the foot-footprint construction from
// tools/posegen/model.py. gate.py is the contract: both implementations must
// agree on the same three checks — (a) every hinge joint within its limits,
// (b) the COM projects inside the foot-support hull, (c) contact penetration
// within tolerance — so the offline library (#8) final-passes this gate.
// Change either side only in lockstep with the other.

import type { PoseGate } from '../poses/index';
import { withHandle } from '../spike/handles';
import type { GateEngine } from './engine';

/** Contact penetration tolerance ε (gate.py MAX_PENETRATION_M). Pass iff pen <= ε. */
export const MAX_PENETRATION_M = 5e-3;

/** Joint-limit slack in degrees (gate.py LIMIT_TOL_DEG — grounding/rounding noise). */
export const LIMIT_TOL_DEG = 0.5;

/** The floor-contacting foot geoms whose capsule footprints define the support base
 * (model.py FOOT_GEOMS). */
export const FOOT_GEOMS = ['foot1_right', 'foot2_right', 'foot1_left', 'foot2_left'] as const;

const MJ_JNT_HINGE = 3; // mjtJoint.mjJNT_HINGE
const RAD2DEG = 180 / Math.PI;

export type Vec2 = readonly [number, number];

/** Scalar 2-D cross product (model.py cross2). */
export function cross2(a: Vec2, b: Vec2): number {
  return a[0] * b[1] - a[1] * b[0];
}

/** Andrew's monotone-chain convex hull (CCW), for the support polygon
 * (gate.py _convex_hull): lexicographic sort by (x, y), pop while cross <= 1e-12. */
export function convexHull(points: readonly Vec2[]): Vec2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = (seq: readonly Vec2[]): Vec2[] => {
    const out: Vec2[] = [];
    for (const p of seq) {
      while (out.length >= 2) {
        const a = out[out.length - 2] as Vec2;
        const b = out[out.length - 1] as Vec2;
        if (cross2([b[0] - a[0], b[1] - a[1]], [p[0] - a[0], p[1] - a[1]]) > 1e-12) break;
        out.pop();
      }
      out.push(p);
    }
    return out;
  };
  const lower = half(pts);
  const upper = half([...pts].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Orientation-agnostic convex point-in-polygon test (gate.py _point_in_hull):
 * fewer than 3 vertices contain nothing; otherwise every edge cross must share
 * a sign within a 1e-6 tolerance band. */
export function pointInHull(point: Vec2, hull: readonly Vec2[]): boolean {
  const n = hull.length;
  if (n < 3) return false;
  const signs: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = hull[i] as Vec2;
    const b = hull[(i + 1) % n] as Vec2;
    signs.push(cross2([b[0] - a[0], b[1] - a[1]], [point[0] - a[0], point[1] - a[1]]));
  }
  return signs.every((s) => s >= -1e-6) || signs.every((s) => s <= 1e-6);
}

/** Foot geom ids, resolved once per engine (name lookups are not per-call work). */
const footIdCache = new WeakMap<GateEngine, readonly number[]>();

function footGeomIds(engine: GateEngine): readonly number[] {
  let ids = footIdCache.get(engine);
  if (!ids) {
    ids = FOOT_GEOMS.map((name) => {
      const id = engine.mj.mj_name2id(engine.model, engine.mj.mjtObj.mjOBJ_GEOM.value, name);
      if (id < 0) throw new Error(`gate: geom '${name}' missing from model`);
      return id;
    });
    footIdCache.set(engine, ids);
  }
  return ids;
}

// NOTE on views: every model/data array below is re-acquired from the engine on
// each call — typed-array views detach when the WASM heap grows, so caching one
// across calls is a correctness bug, not an optimization.

/** gate.py _joint_limits_ok: every hinge joint within [lo - tol, hi + tol] degrees.
 * Free/ball joints are unchecked (and model.jnt_limited is unreadable through the
 * bindings — hinge ranges are always authored in this model). */
function jointLimitsOk(engine: GateEngine): boolean {
  const { model, data } = engine;
  const njnt = model.njnt as number;
  const jntType = model.jnt_type; // Int32Array view
  const jntRange = model.jnt_range; // Float64Array view, (njnt, 2) radians
  const jntQposadr = model.jnt_qposadr; // Int32Array view
  const qpos = data.qpos; // Float64Array view
  for (let j = 0; j < njnt; j++) {
    if (jntType[j] !== MJ_JNT_HINGE) continue;
    const valueDeg = (qpos[jntQposadr[j]] as number) * RAD2DEG;
    const loDeg = (jntRange[2 * j] as number) * RAD2DEG;
    const hiDeg = (jntRange[2 * j + 1] as number) * RAD2DEG;
    if (valueDeg < loDeg - LIMIT_TOL_DEG || valueDeg > hiDeg + LIMIT_TOL_DEG) return false;
  }
  return true;
}

/** gate.py _max_penetration: max over all contacts of -dist where dist < 0, else 0.
 * `data.contact` and each `get(i)` return Embind COPIES — both must be deleted
 * every call or the WASM heap leaks. */
function maxPenetration(engine: GateEngine): number {
  const { data } = engine;
  const ncon = data.ncon;
  if (ncon === 0) return 0;
  return withHandle(data.contact, (con) => {
    let pen = 0;
    for (let i = 0; i < ncon; i++) {
      const c = con.get(i);
      if (!c) continue;
      pen = withHandle(c, (contact) => Math.max(pen, -contact.dist));
    }
    return pen;
  });
}

/** model.py footprint: xy of every foot-capsule endpoint (8 points). Each endpoint
 * is geom center ± half-length along the capsule's local z axis — column 2 of the
 * row-major 3x3 geom_xmat; only the x,y components matter for the support hull.
 * Exported for the projection's ComSupportLimit (limits.ts) so both sides build
 * the support polygon from the identical construction. */
export function footprint(engine: GateEngine): Vec2[] {
  const xpos = engine.data.geom_xpos; // Float64Array view, (ngeom, 3)
  const xmat = engine.data.geom_xmat; // Float64Array view, (ngeom, 9) row-major
  const size = engine.model.geom_size; // Float64Array view, (ngeom, 3)
  const pts: Vec2[] = [];
  for (const g of footGeomIds(engine)) {
    const half = size[g * 3 + 1] as number;
    const cx = xpos[g * 3] as number;
    const cy = xpos[g * 3 + 1] as number;
    const zx = xmat[g * 9 + 2] as number;
    const zy = xmat[g * 9 + 5] as number;
    for (const s of [1, -1]) {
      pts.push([cx + s * half * zx, cy + s * half * zy]);
    }
  }
  return pts;
}

/** model.py com_xy: xy of the world subtree COM (body 0 — includes the ball mass). */
function comXy(engine: GateEngine): Vec2 {
  const com = engine.data.subtree_com; // Float64Array view, (nbody, 3)
  return [com[0] as number, com[1] as number];
}

/**
 * gate.py evaluate: set `qpos`, run mj_forward, and report the three checks.
 * Values are raw — nothing is rounded (gate.py only rounds for JSON export).
 */
export function evaluateQpos(engine: GateEngine, qpos: ArrayLike<number>): PoseGate {
  const { mj, model, data } = engine;
  const q = data.qpos;
  if (qpos.length !== (q.length as number)) {
    throw new Error(`gate: qpos has length ${qpos.length}, model expects nq=${q.length}`);
  }
  q.set(qpos);
  mj.mj_forward(model, data);

  const jointLimits = jointLimitsOk(engine);
  const maxPenetrationM = maxPenetration(engine);
  const comInSupport = pointInHull(comXy(engine), convexHull(footprint(engine)));
  const valid = jointLimits && comInSupport && maxPenetrationM <= MAX_PENETRATION_M;
  return { jointLimits, comInSupport, maxPenetrationM, valid };
}
