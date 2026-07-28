/* Minimal SO(3)/SE(3) lie-algebra layer for the physical-validity gate (issue #9).
 *
 * Ported from kevinzakka/mink, src/mink/lie/{base,so3,se3}.py, pinned commit
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
 * Changes from upstream (Python/numpy/mujoco → plain TypeScript + Float64Array):
 * - Python dataclasses become plain readonly objects; the class surface becomes
 *   function namespaces (SO3.*, SE3.*). Only the surface the gate needs is ported
 *   (no rpy/clamp/interpolate/mocap/normalize/ljac).
 * - mujoco kernel calls are replaced with hand-rolled equivalents: mju_mat2Quat's
 *   Shepperd-style branch is ported directly; mju_mulQuat / mju_negQuat /
 *   mju_rotVecQuat / mju_quat2Mat are inlined quaternion algebra; SO3.exp uses a
 *   sin(θ/2)/θ Taylor branch instead of mju_normalize3 + mju_axisAngle2Quat.
 * - SO3.log's shortest-path sign fix uses (q0 < 0 ? -1 : 1) where upstream uses
 *   np.sign(q0), which is 0 at exactly q0 == 0.
 * - sampleUniform takes an injected seeded rng (never Math.random) and draws the
 *   rotation with the normal-4 quaternion method; upstream uses np.random with the
 *   LaValle subgroup-algorithm method.
 * - Conventions are unchanged: quaternions are [w, x, y, z]; SE3 parameters are
 *   wxyz_xyz (length 7); SE3 tangents are translation-first
 *   [vx, vy, vz, ωx, ωy, ωz]; float64 epsilon is 1e-10; matrices are row-major
 *   Float64Array (3×3 → length 9, 6×6 → length 36).
 * - Equation-number comments ("Eq." / "Eqn.") refer to Solà et al., "A micro Lie
 *   theory for state estimation in robotics", as in upstream.
 */

/** Uniform PRNG on [0, 1). Tests inject a seeded mulberry32; never Math.random. */
export type Rng = () => number;

/** Float64 epsilon used for all Taylor-expansion branch points (mink get_epsilon). */
const EPSILON = 1e-10;

/** Rotation in SO(3), parameterized as a unit quaternion [w, x, y, z]. */
export interface SO3 {
  readonly wxyz: Float64Array;
}

/** Rigid transform in SE(3), parameterized as [qw, qx, qy, qz, x, y, z]. */
export interface SE3 {
  readonly wxyzXyz: Float64Array;
}

// ── internal helpers ─────────────────────────────────────────────────────────

/** Skew-symmetric matrix [x]× of a 3-vector, as a row-major 3×3. */
function skew3(x: number, y: number, z: number): Float64Array {
  // prettier-ignore
  return new Float64Array([
    0, -z, y,
    z, 0, -x,
    -y, x, 0,
  ]);
}

/** Row-major 3×3 product a·b. */
function mat3Mul(a: Float64Array, b: Float64Array): Float64Array {
  const out = new Float64Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      out[3 * i + j] = a[3 * i]! * b[j]! + a[3 * i + 1]! * b[3 + j]! + a[3 * i + 2]! * b[6 + j]!;
    }
  }
  return out;
}

/** Row-major 3×3 matrix–vector product m·[x, y, z]. */
function mat3MulVec(m: Float64Array, x: number, y: number, z: number): Float64Array {
  return new Float64Array([
    m[0]! * x + m[1]! * y + m[2]! * z,
    m[3]! * x + m[4]! * y + m[5]! * z,
    m[6]! * x + m[7]! * y + m[8]! * z,
  ]);
}

/** Quaternion product a·b, both [w, x, y, z] (mju_mulQuat equivalent). */
function mulQuat(a: Float64Array, b: Float64Array): Float64Array {
  const [aw, ax, ay, az] = [a[0]!, a[1]!, a[2]!, a[3]!];
  const [bw, bx, by, bz] = [b[0]!, b[1]!, b[2]!, b[3]!];
  return new Float64Array([
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ]);
}

/** Rotate [x, y, z] by unit quaternion q (mju_rotVecQuat equivalent). */
function rotVecQuat(q: Float64Array, x: number, y: number, z: number): Float64Array {
  const [w, qx, qy, qz] = [q[0]!, q[1]!, q[2]!, q[3]!];
  // v' = v + w·t + qv × t with t = 2·(qv × v).
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  return new Float64Array([
    x + w * tx + qy * tz - qz * ty,
    y + w * ty + qz * tx - qx * tz,
    z + w * tz + qx * ty - qy * tx,
  ]);
}

/** Standard normal deviate via Box–Muller. */
function gaussian(rng: Rng): number {
  const u = 1 - rng(); // in (0, 1] so log() is finite
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── SO3 ──────────────────────────────────────────────────────────────────────

export const SO3 = {
  identity(): SO3 {
    return { wxyz: new Float64Array([1, 0, 0, 0]) };
  },

  /** Build from a [w, x, y, z] quaternion; normalizes defensively. */
  fromQuatWxyz(wxyz: ArrayLike<number>): SO3 {
    const q = new Float64Array([wxyz[0]!, wxyz[1]!, wxyz[2]!, wxyz[3]!]);
    const n = Math.hypot(q[0]!, q[1]!, q[2]!, q[3]!);
    if (n < EPSILON) throw new Error('fromQuatWxyz: zero-norm quaternion');
    for (let i = 0; i < 4; i++) q[i] = q[i]! / n;
    return { wxyz: q };
  },

  /** Row-major 3×3 rotation matrix → quaternion (port of mju_mat2Quat; normalizes). */
  fromMatrix(matrix: ArrayLike<number>): SO3 {
    const m = matrix;
    const q = new Float64Array(4);
    const trace = m[0]! + m[4]! + m[8]!;
    if (trace > 0) {
      // q0 largest
      q[0] = 0.5 * Math.sqrt(1 + trace);
      q[1] = (0.25 * (m[7]! - m[5]!)) / q[0]!;
      q[2] = (0.25 * (m[2]! - m[6]!)) / q[0]!;
      q[3] = (0.25 * (m[3]! - m[1]!)) / q[0]!;
    } else if (m[0]! > m[4]! && m[0]! > m[8]!) {
      // q1 largest
      q[1] = 0.5 * Math.sqrt(1 + m[0]! - m[4]! - m[8]!);
      q[0] = (0.25 * (m[7]! - m[5]!)) / q[1]!;
      q[2] = (0.25 * (m[1]! + m[3]!)) / q[1]!;
      q[3] = (0.25 * (m[2]! + m[6]!)) / q[1]!;
    } else if (m[4]! > m[8]!) {
      // q2 largest
      q[2] = 0.5 * Math.sqrt(1 - m[0]! + m[4]! - m[8]!);
      q[0] = (0.25 * (m[2]! - m[6]!)) / q[2]!;
      q[1] = (0.25 * (m[1]! + m[3]!)) / q[2]!;
      q[3] = (0.25 * (m[5]! + m[7]!)) / q[2]!;
    } else {
      // q3 largest
      q[3] = 0.5 * Math.sqrt(1 - m[0]! - m[4]! + m[8]!);
      q[0] = (0.25 * (m[3]! - m[1]!)) / q[3]!;
      q[1] = (0.25 * (m[2]! + m[6]!)) / q[3]!;
      q[2] = (0.25 * (m[5]! + m[7]!)) / q[3]!;
    }
    return SO3.fromQuatWxyz(q);
  },

  // Eq. 138.
  /** Rotation as a row-major 3×3 matrix (mju_quat2Mat equivalent). */
  toMatrix(rotation: SO3): Float64Array {
    const [w, x, y, z] = [
      rotation.wxyz[0]!,
      rotation.wxyz[1]!,
      rotation.wxyz[2]!,
      rotation.wxyz[3]!,
    ];
    // prettier-ignore
    return new Float64Array([
      1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
      2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
      2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
    ]);
  },

  multiply(a: SO3, b: SO3): SO3 {
    return { wxyz: mulQuat(a.wxyz, b.wxyz) };
  },

  inverse(rotation: SO3): SO3 {
    const q = rotation.wxyz;
    return { wxyz: new Float64Array([q[0]!, -q[1]!, -q[2]!, -q[3]!]) };
  },

  // Eq. 136.
  apply(rotation: SO3, target: ArrayLike<number>): Float64Array {
    return rotVecQuat(rotation.wxyz, target[0]!, target[1]!, target[2]!);
  },

  // Eq. 132.
  exp(tangent: ArrayLike<number>): SO3 {
    const [x, y, z] = [tangent[0]!, tangent[1]!, tangent[2]!];
    const theta = Math.hypot(x, y, z);
    // sin(θ/2)/θ, with Taylor branch 1/2 − θ²/48 near zero.
    const k = theta < EPSILON ? 0.5 - (theta * theta) / 48 : Math.sin(0.5 * theta) / theta;
    return { wxyz: new Float64Array([Math.cos(0.5 * theta), k * x, k * y, k * z]) };
  },

  // Eq. 133.
  log(rotation: SO3): Float64Array {
    // Shortest-path sign fix: flip to the q0 >= 0 hemisphere.
    const sign = rotation.wxyz[0]! < 0 ? -1 : 1;
    const w = sign * rotation.wxyz[0]!;
    const x = sign * rotation.wxyz[1]!;
    const y = sign * rotation.wxyz[2]!;
    const z = sign * rotation.wxyz[3]!;
    const norm = Math.hypot(x, y, z);
    if (norm < EPSILON) return new Float64Array(3);
    const scale = (2 * Math.atan2(norm, w)) / norm;
    return new Float64Array([scale * x, scale * y, scale * z]);
  },

  /**
   * Inverse of the left Jacobian: I − ½[ω]× + β[ω]×² with
   * β = (1/θ²)(1 − θ·sinθ / (2(1 − cosθ))).
   */
  ljacinv(other: ArrayLike<number>): Float64Array {
    const [x, y, z] = [other[0]!, other[1]!, other[2]!];
    const t2 = x * x + y * y + z * z;
    const theta = Math.sqrt(t2);
    let beta: number;
    if (theta < EPSILON) {
      beta = (1 / 12) * (1 + (t2 / 60) * (1 + (t2 / 42) * (1 + t2 / 40)));
    } else {
      beta = (1 / t2) * (1 - (theta * Math.sin(theta)) / (2 * (1 - Math.cos(theta))));
    }
    // β·([ω]×² = ωωᵀ − θ²I)  −  ½[ω]×  +  I
    // prettier-ignore
    return new Float64Array([
      beta * (x * x - t2) + 1, beta * x * y + 0.5 * z, beta * x * z - 0.5 * y,
      beta * y * x - 0.5 * z, beta * (y * y - t2) + 1, beta * y * z + 0.5 * x,
      beta * z * x + 0.5 * y, beta * z * y - 0.5 * x, beta * (z * z - t2) + 1,
    ]);
  },

  /** Haar-uniform random rotation: normalized 4-vector of standard normals. */
  sampleUniform(rng: Rng): SO3 {
    for (;;) {
      const q = [gaussian(rng), gaussian(rng), gaussian(rng), gaussian(rng)];
      if (Math.hypot(q[0]!, q[1]!, q[2]!, q[3]!) >= EPSILON) return SO3.fromQuatWxyz(q);
    }
  },
};

// ── SE3 ──────────────────────────────────────────────────────────────────────

// Eqn 180.
/** Q(ξ) helper for the SE3 left-Jacobian blocks; ξ = [v, ω], translation-first. */
function getQ(c: ArrayLike<number>): Float64Array {
  const theta = Math.hypot(c[3]!, c[4]!, c[5]!);
  const t2 = theta * theta;
  const A = 0.5;
  let B: number, C: number, D: number;
  if (t2 < EPSILON) {
    B = 1 / 6 + (1 / 120) * t2;
    C = -(1 / 24) + (1 / 720) * t2;
    D = -(1 / 60);
  } else {
    const t4 = t2 * t2;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    B = (theta - sinTheta) / (t2 * theta);
    C = (1 - 0.5 * t2 - cosTheta) / t4;
    D = (2 * theta - 3 * sinTheta + theta * cosTheta) / (2 * t4 * theta);
  }
  const V = skew3(c[0]!, c[1]!, c[2]!);
  const W = skew3(c[3]!, c[4]!, c[5]!);
  const VW = mat3Mul(V, W);
  const WV = mat3Mul(W, V); // == VWᵀ
  const WVW = mat3Mul(WV, W);
  const VWW = mat3Mul(VW, W);
  const WWVW = mat3Mul(W, WVW);
  const WVWW = mat3Mul(WVW, W);
  const out = new Float64Array(9);
  for (let i = 0; i < 9; i++) {
    // VWWᵀ (transpose of a row-major 3×3): index (r, c) → (c, r).
    const t = 3 * (i % 3) + Math.floor(i / 3);
    out[i] =
      A * V[i]! +
      B * (WV[i]! + VW[i]! + WVW[i]!) -
      C * (VWW[i]! - VWW[t]! - 3 * WVW[i]!) +
      D * (WVWW[i]! + WWVW[i]!);
  }
  return out;
}

export const SE3 = {
  identity(): SE3 {
    return { wxyzXyz: new Float64Array([1, 0, 0, 0, 0, 0, 0]) };
  },

  fromRotationTranslation(rotation: SO3, translation: ArrayLike<number>): SE3 {
    const p = new Float64Array(7);
    p.set(rotation.wxyz, 0);
    p[4] = translation[0]!;
    p[5] = translation[1]!;
    p[6] = translation[2]!;
    return { wxyzXyz: p };
  },

  multiply(a: SE3, b: SE3): SE3 {
    const aq = a.wxyzXyz.subarray(0, 4);
    const p = new Float64Array(7);
    p.set(mulQuat(aq, b.wxyzXyz.subarray(0, 4)), 0);
    const t = rotVecQuat(aq, b.wxyzXyz[4]!, b.wxyzXyz[5]!, b.wxyzXyz[6]!);
    p[4] = t[0]! + a.wxyzXyz[4]!;
    p[5] = t[1]! + a.wxyzXyz[5]!;
    p[6] = t[2]! + a.wxyzXyz[6]!;
    return { wxyzXyz: p };
  },

  inverse(transform: SE3): SE3 {
    const q = transform.wxyzXyz;
    const invQ = new Float64Array([q[0]!, -q[1]!, -q[2]!, -q[3]!]);
    const t = rotVecQuat(invQ, -q[4]!, -q[5]!, -q[6]!);
    return {
      wxyzXyz: new Float64Array([invQ[0]!, invQ[1]!, invQ[2]!, invQ[3]!, t[0]!, t[1]!, t[2]!]),
    };
  },

  apply(transform: SE3, target: ArrayLike<number>): Float64Array {
    const p = transform.wxyzXyz;
    const rotated = rotVecQuat(p.subarray(0, 4), target[0]!, target[1]!, target[2]!);
    rotated[0] = rotated[0]! + p[4]!;
    rotated[1] = rotated[1]! + p[5]!;
    rotated[2] = rotated[2]! + p[6]!;
    return rotated;
  },

  exp(tangent: ArrayLike<number>): SE3 {
    const [wx, wy, wz] = [tangent[3]!, tangent[4]!, tangent[5]!];
    const rotation = SO3.exp([wx, wy, wz]);
    const t2 = wx * wx + wy * wy + wz * wz;
    const theta = Math.sqrt(t2);
    let vMat: Float64Array;
    if (t2 < EPSILON) {
      vMat = SO3.toMatrix(rotation);
    } else {
      const W = skew3(wx, wy, wz);
      const WW = mat3Mul(W, W);
      const a = (1 - Math.cos(theta)) / t2;
      const b = (theta - Math.sin(theta)) / (t2 * theta);
      vMat = new Float64Array(9);
      for (let i = 0; i < 9; i++) vMat[i] = a * W[i]! + b * WW[i]!;
      vMat[0] = vMat[0]! + 1;
      vMat[4] = vMat[4]! + 1;
      vMat[8] = vMat[8]! + 1;
    }
    return SE3.fromRotationTranslation(
      rotation,
      mat3MulVec(vMat, tangent[0]!, tangent[1]!, tangent[2]!),
    );
  },

  log(transform: SE3): Float64Array {
    const p = transform.wxyzXyz;
    const omega = SO3.log({ wxyz: p.subarray(0, 4) });
    const [wx, wy, wz] = [omega[0]!, omega[1]!, omega[2]!];
    const t2 = wx * wx + wy * wy + wz * wz;
    const theta = Math.sqrt(t2);
    const W = skew3(wx, wy, wz);
    const WW = mat3Mul(W, W);
    // V⁻¹ = I − ½[ω]× + c·[ω]×², c = (1 − ½θ·cot(θ/2))/θ², Taylor c = 1/12.
    const c =
      t2 < EPSILON
        ? 1 / 12
        : (1 - (0.5 * theta * Math.cos(0.5 * theta)) / Math.sin(0.5 * theta)) / t2;
    const vinv = new Float64Array(9);
    for (let i = 0; i < 9; i++) vinv[i] = -0.5 * W[i]! + c * WW[i]!;
    vinv[0] = vinv[0]! + 1;
    vinv[4] = vinv[4]! + 1;
    vinv[8] = vinv[8]! + 1;
    const trans = mat3MulVec(vinv, p[4]!, p[5]!, p[6]!);
    return new Float64Array([trans[0]!, trans[1]!, trans[2]!, wx, wy, wz]);
  },

  // Eqn. 26.
  /** rminus(a, b) = log(b⁻¹ ∘ a). */
  rminus(a: SE3, b: SE3): Float64Array {
    return SE3.log(SE3.multiply(SE3.inverse(b), a));
  },

  /** Adjoint [[R, [t]×·R], [0, R]] as a row-major 6×6 (translation-first blocks). */
  adjoint(transform: SE3): Float64Array {
    const p = transform.wxyzXyz;
    const R = SO3.toMatrix({ wxyz: p.subarray(0, 4) });
    const tR = mat3Mul(skew3(p[4]!, p[5]!, p[6]!), R);
    const out = new Float64Array(36);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        out[6 * i + j] = R[3 * i + j]!;
        out[6 * i + j + 3] = tR[3 * i + j]!;
        out[6 * (i + 3) + j + 3] = R[3 * i + j]!;
      }
    }
    return out;
  },

  // Eqn 179 b)
  /** Inverse left Jacobian [[Jl⁻¹, −Jl⁻¹·Q·Jl⁻¹], [0, Jl⁻¹]] as a row-major 6×6. */
  ljacinv(other: ArrayLike<number>): Float64Array {
    const [wx, wy, wz] = [other[3]!, other[4]!, other[5]!];
    const t2 = wx * wx + wy * wy + wz * wz;
    const out = new Float64Array(36);
    if (t2 < EPSILON) {
      for (let i = 0; i < 6; i++) out[7 * i] = 1;
      return out;
    }
    const Q = getQ(other);
    const jinv = SO3.ljacinv([wx, wy, wz]);
    const topRight = mat3Mul(jinv, mat3Mul(Q, jinv));
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        out[6 * i + j] = jinv[3 * i + j]!;
        out[6 * i + j + 3] = -topRight[3 * i + j]!;
        out[6 * (i + 3) + j + 3] = jinv[3 * i + j]!;
      }
    }
    return out;
  },

  // Eqn. 79: jlog = rjacinv(log X) = ljacinv(−log X).
  jlog(transform: SE3): Float64Array {
    const tangent = SE3.log(transform);
    for (let i = 0; i < 6; i++) tangent[i] = -tangent[i]!;
    return SE3.ljacinv(tangent);
  },

  /** Haar-uniform rotation + uniform translation in [−1, 1]³. */
  sampleUniform(rng: Rng): SE3 {
    return SE3.fromRotationTranslation(SO3.sampleUniform(rng), [
      2 * rng() - 1,
      2 * rng() - 1,
      2 * rng() - 1,
    ]);
  },
};
