/* Tests for the gate's SO(3)/SE(3) lie-algebra layer (issue #9).
 *
 * Structure ported from kevinzakka/mink tests/test_lie_axioms.py and
 * tests/test_lie_operations.py, pinned commit
 * 44c8a6ab66d27d06249f9018334a51662605e3e4, Apache-2.0 (Copyright 2024 Kevin
 * Zakka; see the licence block in ./lie.ts). Changes: absltest/numpy → vitest +
 * Float64Array; np.random → a seeded mulberry32 PRNG injected into
 * sampleUniform; only the axioms/operations covered by the ported surface are
 * kept, plus small-angle branch checks.
 */

import { describe, expect, it } from 'vitest';
import type { Rng } from './lie';
import { SE3, SO3 } from './lie';

/** Deterministic 32-bit PRNG on [0, 1). */
function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: Rng): number {
  const u = 1 - rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** Assert two numeric arrays agree within an absolute tolerance. */
function expectArrayClose(
  actual: ArrayLike<number>,
  expected: ArrayLike<number>,
  tol: number,
  label: string,
): void {
  expect(actual.length, label).toBe(expected.length);
  for (let i = 0; i < actual.length; i++) {
    expect(Number.isFinite(actual[i]!), `${label}[${i}] is not finite`).toBe(true);
    expect(Math.abs(actual[i]! - expected[i]!), `${label}[${i}]`).toBeLessThanOrEqual(tol);
  }
}

/**
 * Assert two group-element parameter vectors agree within tol, up to the sign
 * of the leading [w, x, y, z] quaternion (q and −q are the same rotation).
 */
function expectTransformClose(
  actual: Float64Array,
  expected: Float64Array,
  tol: number,
  label: string,
): void {
  let dot = 0;
  for (let i = 0; i < 4; i++) dot += actual[i]! * expected[i]!;
  const sign = dot < 0 ? -1 : 1;
  const signed = Float64Array.from(expected, (v, i) => (i < 4 ? sign * v : v));
  expectArrayClose(actual, signed, tol, label);
}

/** Random unit 3-vector scaled to a rotation angle strictly inside (0, π). */
function randomRotationTangent(rng: Rng): [number, number, number] {
  for (;;) {
    const x = gaussian(rng);
    const y = gaussian(rng);
    const z = gaussian(rng);
    const n = Math.hypot(x, y, z);
    if (n < 1e-9) continue;
    const scale = (rng() * (Math.PI - 1e-3)) / n;
    return [scale * x, scale * y, scale * z];
  }
}

/** 6×6 row-major matrix times length-6 vector. */
function mat6MulVec(m: Float64Array, v: ArrayLike<number>): Float64Array {
  const out = new Float64Array(6);
  for (let r = 0; r < 6; r++) {
    let acc = 0;
    for (let c = 0; c < 6; c++) acc += m[6 * r + c]! * v[c]!;
    out[r] = acc;
  }
  return out;
}

/** Uniform adapter so the axiom suite runs over both groups on raw params. */
interface GroupAdapter {
  readonly name: string;
  readonly tangentDim: number;
  sample(rng: Rng): Float64Array;
  identity(): Float64Array;
  multiply(a: Float64Array, b: Float64Array): Float64Array;
  inverse(a: Float64Array): Float64Array;
  log(a: Float64Array): Float64Array;
  exp(tangent: ArrayLike<number>): Float64Array;
  /** Random tangent whose rotation part has norm < π. */
  randomTangent(rng: Rng): Float64Array;
}

const so3Adapter: GroupAdapter = {
  name: 'SO3',
  tangentDim: 3,
  sample: (rng) => SO3.sampleUniform(rng).wxyz,
  identity: () => SO3.identity().wxyz,
  multiply: (a, b) => SO3.multiply({ wxyz: a }, { wxyz: b }).wxyz,
  inverse: (a) => SO3.inverse({ wxyz: a }).wxyz,
  log: (a) => SO3.log({ wxyz: a }),
  exp: (tangent) => SO3.exp(tangent).wxyz,
  randomTangent: (rng) => Float64Array.from(randomRotationTangent(rng)),
};

const se3Adapter: GroupAdapter = {
  name: 'SE3',
  tangentDim: 6,
  sample: (rng) => SE3.sampleUniform(rng).wxyzXyz,
  identity: () => SE3.identity().wxyzXyz,
  multiply: (a, b) => SE3.multiply({ wxyzXyz: a }, { wxyzXyz: b }).wxyzXyz,
  inverse: (a) => SE3.inverse({ wxyzXyz: a }).wxyzXyz,
  log: (a) => SE3.log({ wxyzXyz: a }),
  exp: (tangent) => SE3.exp(tangent).wxyzXyz,
  randomTangent: (rng) => {
    const [wx, wy, wz] = randomRotationTangent(rng);
    return new Float64Array([2 * rng() - 1, 2 * rng() - 1, 2 * rng() - 1, wx, wy, wz]);
  },
};

const SAMPLES = 50;
const TOL = 1e-9;

describe.each([so3Adapter, se3Adapter])('$name axioms', (group) => {
  it('identity: X ∘ I = I ∘ X = X', () => {
    const rng = mulberry32(0xa11c0de);
    const identity = group.identity();
    for (let i = 0; i < SAMPLES; i++) {
      const x = group.sample(rng);
      expectTransformClose(group.multiply(x, identity), x, TOL, `X·I #${i}`);
      expectTransformClose(group.multiply(identity, x), x, TOL, `I·X #${i}`);
    }
  });

  it('inverse: X ∘ X⁻¹ = X⁻¹ ∘ X = I', () => {
    const rng = mulberry32(0xbead);
    const identity = group.identity();
    for (let i = 0; i < SAMPLES; i++) {
      const x = group.sample(rng);
      expectTransformClose(group.multiply(x, group.inverse(x)), identity, TOL, `X·X⁻¹ #${i}`);
      expectTransformClose(group.multiply(group.inverse(x), x), identity, TOL, `X⁻¹·X #${i}`);
    }
  });

  it('associativity: (A ∘ B) ∘ C = A ∘ (B ∘ C)', () => {
    const rng = mulberry32(0xcafe);
    for (let i = 0; i < SAMPLES; i++) {
      const a = group.sample(rng);
      const b = group.sample(rng);
      const c = group.sample(rng);
      expectTransformClose(
        group.multiply(group.multiply(a, b), c),
        group.multiply(a, group.multiply(b, c)),
        TOL,
        `assoc #${i}`,
      );
    }
  });

  it('log ∘ exp roundtrip: exp(log X) = X', () => {
    const rng = mulberry32(0xd00d);
    for (let i = 0; i < SAMPLES; i++) {
      const x = group.sample(rng);
      expectTransformClose(group.exp(group.log(x)), x, TOL, `exp(log X) #${i}`);
    }
  });

  it('exp ∘ log roundtrip: log(exp ξ) = ξ for ‖ω‖ < π', () => {
    const rng = mulberry32(0xf00d);
    for (let i = 0; i < SAMPLES; i++) {
      const tangent = group.randomTangent(rng);
      expectArrayClose(group.log(group.exp(tangent)), tangent, TOL, `log(exp ξ) #${i}`);
    }
  });
});

describe('small-angle branches', () => {
  const identity3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const identity6 = new Float64Array(36);
  for (let i = 0; i < 6; i++) identity6[7 * i] = 1;

  it('SO3 log/exp/ljacinv at θ = 0', () => {
    expectArrayClose(SO3.log(SO3.identity()), [0, 0, 0], 0, 'log(I)');
    expectArrayClose(SO3.exp([0, 0, 0]).wxyz, [1, 0, 0, 0], 0, 'exp(0)');
    expectArrayClose(SO3.ljacinv([0, 0, 0]), identity3, 0, 'ljacinv(0)');
  });

  it('SO3 log/exp/ljacinv at θ = 1e-12', () => {
    const tiny = [1e-12, 0, 0];
    const q = SO3.exp(tiny);
    expectArrayClose(q.wxyz, [1, 5e-13, 0, 0], 1e-15, 'exp(1e-12)');
    expectArrayClose(SO3.log(q), tiny, 1e-9, 'log(exp(1e-12))');
    expectArrayClose(SO3.ljacinv(tiny), identity3, 1e-9, 'ljacinv(1e-12)');
  });

  it('SE3 log/exp/ljacinv at θ = 0 (pure translation)', () => {
    const tangent = [0.3, -0.2, 0.1, 0, 0, 0];
    const transform = SE3.exp(tangent);
    expectArrayClose(transform.wxyzXyz, [1, 0, 0, 0, 0.3, -0.2, 0.1], TOL, 'exp');
    expectArrayClose(SE3.log(transform), tangent, TOL, 'log(exp ξ)');
    expectArrayClose(SE3.ljacinv(tangent), identity6, 0, 'ljacinv');
    expectArrayClose(SE3.jlog(transform), identity6, 0, 'jlog');
  });

  it('SE3 log/exp/ljacinv at θ = 1e-12', () => {
    const tangent = [0.3, -0.2, 0.1, 1e-12, 0, 0];
    const transform = SE3.exp(tangent);
    expectArrayClose(SE3.log(transform), tangent, 1e-9, 'log(exp ξ)');
    // θ² < ε ⇒ identity branch, mirroring mink's SE3.ljacinv.
    expectArrayClose(SE3.ljacinv(tangent), identity6, 1e-9, 'ljacinv');
  });
});

describe('SE3 jlog', () => {
  it('linearizes the right-plus: log(X ∘ exp δ) ≈ log X + jlog(X)·δ', () => {
    const rng = mulberry32(0x109c0de);
    const deltaNorm = 1e-6;
    for (let i = 0; i < 10; i++) {
      let x = SE3.sampleUniform(rng);
      // The first-order check needs slack from the log branch cut at θ = π,
      // where curvature blows up; resample the rare near-π rotations.
      while (Math.hypot(...SE3.log(x).slice(3)) > 3.0) x = SE3.sampleUniform(rng);
      const jacobian = SE3.jlog(x);
      const base = SE3.log(x);
      for (let k = 0; k < 6; k++) {
        const delta = new Float64Array(6);
        for (let d = 0; d < 6; d++) delta[d] = gaussian(rng);
        const n = Math.hypot(...delta);
        for (let d = 0; d < 6; d++) delta[d] = (delta[d]! / n) * deltaNorm;

        const perturbed = SE3.log(SE3.multiply(x, SE3.exp(delta)));
        const jd = mat6MulVec(jacobian, delta);
        const linearized = Float64Array.from(base, (v, d) => v + jd[d]!);
        expectArrayClose(perturbed, linearized, 1e-8, `jlog #${i}.${k}`);
      }
    }
  });
});

describe('SE3 adjoint', () => {
  it('Ad(X)·ξ = log(X ∘ exp(ξ) ∘ X⁻¹) for small ξ', () => {
    const rng = mulberry32(0xad301);
    for (let i = 0; i < 20; i++) {
      const x = SE3.sampleUniform(rng);
      const adjoint = SE3.adjoint(x);
      const xi = new Float64Array(6);
      for (let d = 0; d < 6; d++) xi[d] = gaussian(rng);
      const n = Math.hypot(...xi);
      for (let d = 0; d < 6; d++) xi[d] = (xi[d]! / n) * 1e-3;

      const conjugated = SE3.log(SE3.multiply(SE3.multiply(x, SE3.exp(xi)), SE3.inverse(x)));
      expectArrayClose(mat6MulVec(adjoint, xi), conjugated, TOL, `adjoint #${i}`);
    }
  });
});

describe('SO3 matrix conversions', () => {
  it('fromMatrix ∘ toMatrix roundtrip on random rotations', () => {
    const rng = mulberry32(0x3a7);
    for (let i = 0; i < SAMPLES; i++) {
      const rotation = SO3.sampleUniform(rng);
      const roundtripped = SO3.fromMatrix(SO3.toMatrix(rotation));
      expectTransformClose(roundtripped.wxyz, rotation.wxyz, TOL, `roundtrip #${i}`);
    }
  });

  it('hits all four Shepperd branches (π rotations about x, y, z)', () => {
    for (const axis of [
      [Math.PI, 0, 0],
      [0, Math.PI, 0],
      [0, 0, Math.PI],
      [0.1, -0.2, 0.3],
    ]) {
      const rotation = SO3.exp(axis);
      const roundtripped = SO3.fromMatrix(SO3.toMatrix(rotation));
      expectTransformClose(roundtripped.wxyz, rotation.wxyz, TOL, `axis ${axis.join(',')}`);
    }
  });

  it('toMatrix agrees with apply', () => {
    const rng = mulberry32(0xbee);
    const rotation = SO3.sampleUniform(rng);
    const v: [number, number, number] = [0.3, -1.2, 0.7];
    const m = SO3.toMatrix(rotation);
    const expected = [
      m[0]! * v[0] + m[1]! * v[1] + m[2]! * v[2],
      m[3]! * v[0] + m[4]! * v[1] + m[5]! * v[2],
      m[6]! * v[0] + m[7]! * v[1] + m[8]! * v[2],
    ];
    expectArrayClose(SO3.apply(rotation, v), expected, 1e-12, 'apply vs matrix');
  });
});
