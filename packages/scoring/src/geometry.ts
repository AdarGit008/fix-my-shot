// Sport-agnostic measurement geometry (issue #11, the SPEC "how measured"
// primitives): 3-point joint angles on keypoints, segment-vs-gravity angles
// against the floor plane, and the COM-in-support projection test. Pure math
// over PoseSnapshot payloads — no engine, no sport vocabulary (ADR-0006).

import type { Keypoint } from '@fix-my-shot/core';

export type Vec2 = readonly [number, number];

const RAD2DEG = 180 / Math.PI;

function sub(a: Keypoint, b: Keypoint): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function norm(v: readonly number[]): number {
  return Math.hypot(...v);
}

function dot3(a: readonly number[], b: readonly number[]): number {
  return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
}

/**
 * The 3-point angle at vertex `b` between rays b→a and b→c, degrees in
 * [0, 180]. The baseline's joint-angle reading (180° = straight).
 * @throws {Error} when either ray is degenerate (coincident points).
 */
export function angle3Deg(a: Keypoint, b: Keypoint, c: Keypoint): number {
  const u = sub(a, b);
  const v = sub(c, b);
  const nu = norm(u);
  const nv = norm(v);
  if (nu < 1e-12 || nv < 1e-12) {
    throw new Error('angle3Deg: degenerate ray (coincident keypoints)');
  }
  const cos = Math.min(1, Math.max(-1, dot3(u, v) / (nu * nv)));
  return Math.acos(cos) * RAD2DEG;
}

/**
 * Angle of the segment from→to against gravity's opposite (+z, "vertical"),
 * degrees in [0, 180]: 0 = the segment points straight up.
 * @throws {Error} when the segment is degenerate.
 */
export function segmentVsVerticalDeg(from: Keypoint, to: Keypoint): number {
  const d = sub(to, from);
  const n = norm(d);
  if (n < 1e-12) throw new Error('segmentVsVerticalDeg: degenerate segment');
  const cos = Math.min(1, Math.max(-1, d[2] / n));
  return Math.acos(cos) * RAD2DEG;
}

/**
 * Signed tilt of the segment from→to out of vertical along a horizontal
 * direction, degrees: positive when the top leans toward `direction`,
 * negative when it leans away. The trunk-lean reading (lean toward the
 * target = "forward").
 */
export function signedTiltTowardDeg(from: Keypoint, to: Keypoint, direction: Keypoint): number {
  const d = sub(to, from);
  const horiz = [direction[0], direction[1], 0];
  const nh = norm(horiz);
  if (nh < 1e-12) throw new Error('signedTiltTowardDeg: direction has no horizontal component');
  const along = (d[0] * horiz[0]! + d[1] * horiz[1]!) / nh;
  return Math.atan2(along, d[2]) * RAD2DEG;
}

/** Angle between two directions projected onto the ground plane, degrees
 * [0, 180]. The gentle "faces the target" reading (direction-only, no bands). */
export function horizontalAngleBetweenDeg(a: Keypoint, b: Keypoint): number {
  const na = Math.hypot(a[0], a[1]);
  const nb = Math.hypot(b[0], b[1]);
  if (na < 1e-12 || nb < 1e-12) {
    throw new Error('horizontalAngleBetweenDeg: no horizontal component');
  }
  const cos = Math.min(1, Math.max(-1, (a[0] * b[0] + a[1] * b[1]) / (na * nb)));
  return Math.acos(cos) * RAD2DEG;
}

/** Convex point-in-polygon test on the ground plane (all edge cross products
 * share a sign within tolerance; fewer than 3 vertices contain nothing). */
export function pointInConvexPolygon(
  point: Vec2,
  polygon: readonly Vec2[],
  tol = 1e-6,
): boolean {
  const n = polygon.length;
  if (n < 3) return false;
  let pos = true;
  let neg = true;
  for (let i = 0; i < n; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % n]!;
    const cross = (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
    if (cross < -tol) pos = false;
    if (cross > tol) neg = false;
  }
  return pos || neg;
}

/**
 * How far outside a convex polygon a ground-plane point lies: 0 when inside,
 * else the distance to the nearest edge/vertex. The "gross displacement"
 * reading (a presence check with an engineering margin).
 */
export function distanceOutsideConvexPolygon(point: Vec2, polygon: readonly Vec2[]): number {
  if (pointInConvexPolygon(point, polygon)) return 0;
  let best = Infinity;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % Math.max(1, n)]!;
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const len2 = ex * ex + ey * ey;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((point[0] - a[0]) * ex + (point[1] - a[1]) * ey) / len2)) : 0;
    const dx = point[0] - (a[0] + t * ex);
    const dy = point[1] - (a[1] + t * ey);
    best = Math.min(best, Math.hypot(dx, dy));
  }
  return best;
}

/** Euclidean distance between two keypoints. */
export function distanceM(a: Keypoint, b: Keypoint): number {
  return norm(sub(a, b));
}

/** Horizontal (ground-plane) distance between two keypoints. */
export function horizontalDistanceM(a: Keypoint, b: Keypoint): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/**
 * Signed offset of `point` out of the vertical plane through `origin` spanned
 * by the horizontal `direction` and gravity: 0 = in-plane. The spin-axis
 * alignment reading ("in the implement→target plane").
 * @throws {Error} when direction has no horizontal component.
 */
export function lateralOffsetM(point: Keypoint, origin: Keypoint, direction: Keypoint): number {
  const nh = Math.hypot(direction[0], direction[1]);
  if (nh < 1e-12) throw new Error('lateralOffsetM: direction has no horizontal component');
  // Horizontal normal of the plane: direction rotated +90° in the ground plane.
  const nx = -direction[1] / nh;
  const ny = direction[0] / nh;
  return (point[0] - origin[0]) * nx + (point[1] - origin[1]) * ny;
}

/**
 * Component of point − origin along a direction (full 3-D projection).
 * Positive = on the direction's side of origin.
 */
export function alongM(point: Keypoint, origin: Keypoint, direction: Keypoint): number {
  const n = norm(direction as readonly number[]);
  if (n < 1e-12) throw new Error('alongM: zero direction');
  return dot3(sub(point, origin), direction as readonly number[]) / n;
}
