import { beforeAll, describe, expect, it } from 'vitest';
import type { MainModule } from '@mujoco/mujoco';
import { solveQp } from './qp';

// ── Seeded PRNG (never Math.random — tests must be deterministic) ──────────

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

// ── Small dense helpers ────────────────────────────────────────────────────

/** Random symmetric PD matrix AᵀA + I (eigenvalues in [1, ~n+1]). */
function randPd(rng: () => number, n: number): Float64Array {
  const a = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) a[i] = rng() * 2 - 1;
  const p = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = i === j ? 1 : 0;
      for (let k = 0; k < n; k++) s += (a[k * n + i] ?? 0) * (a[k * n + j] ?? 0);
      p[i * n + j] = s;
      p[j * n + i] = s;
    }
  }
  return p;
}

function randVec(rng: () => number, n: number, scale: number): Float64Array {
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) v[i] = (rng() * 2 - 1) * scale;
  return v;
}

function matVec(m: Float64Array, x: Float64Array, rows: number, cols: number): Float64Array {
  const y = new Float64Array(rows);
  for (let i = 0; i < rows; i++) {
    let s = 0;
    for (let j = 0; j < cols; j++) s += (m[i * cols + j] ?? 0) * (x[j] ?? 0);
    y[i] = s;
  }
  return y;
}

/** Feasible random inequalities: h = G·x₀ + slack with slack ≥ 0, so x₀ is
 * strictly feasible and the solver must succeed. */
function randConstraints(
  rng: () => number,
  n: number,
  m: number,
): { g: Float64Array; h: Float64Array } {
  const g = new Float64Array(m * n);
  for (let i = 0; i < m * n; i++) g[i] = rng() * 2 - 1;
  const x0 = randVec(rng, n, 1);
  const gx0 = matVec(g, x0, m, n);
  const h = new Float64Array(m);
  for (let i = 0; i < m; i++) h[i] = (gx0[i] ?? 0) + 0.5 * rng();
  return { g, h };
}

/** Verify the KKT conditions of a claimed solution directly. */
function expectKkt(
  p: Float64Array,
  q: Float64Array,
  g: Float64Array | null,
  h: Float64Array | null,
  n: number,
  m: number,
  x: Float64Array,
  lambda: Float64Array,
): void {
  // Stationarity: ‖Px + q + Gᵀλ‖∞ ≤ 1e-7.
  const grad = matVec(p, x, n, n);
  for (let i = 0; i < n; i++) grad[i] = (grad[i] ?? 0) + (q[i] ?? 0);
  if (g !== null) {
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < n; j++) {
        grad[j] = (grad[j] ?? 0) + (g[i * n + j] ?? 0) * (lambda[i] ?? 0);
      }
    }
  }
  for (let j = 0; j < n; j++) expect(Math.abs(grad[j] ?? 0)).toBeLessThanOrEqual(1e-7);

  if (g === null || h === null) return;
  const gx = matVec(g, x, m, n);
  for (let i = 0; i < m; i++) {
    const slack = (gx[i] ?? 0) - (h[i] ?? 0);
    // Primal feasibility, dual feasibility, complementary slackness.
    expect(slack).toBeLessThanOrEqual(1e-9);
    expect(lambda[i] ?? 0).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.abs((lambda[i] ?? 0) * slack)).toBeLessThanOrEqual(1e-7);
  }
}

// ── 1. Unconstrained: x = −P⁻¹q ────────────────────────────────────────────

describe('unconstrained minimum', () => {
  it('solves a hand-computed 2×2 diagonal system', () => {
    // P = diag(2, 4), q = [−2, −8] ⇒ x = [1, 2].
    const p = Float64Array.from([2, 0, 0, 4]);
    const q = Float64Array.from([-2, -8]);
    const res = solveQp(p, q, null, null, 2, 0);
    expect(res.found).toBe(true);
    expect(res.iterations).toBe(0);
    expect(Math.abs((res.x[0] ?? 0) - 1)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs((res.x[1] ?? 0) - 2)).toBeLessThanOrEqual(1e-12);
    expect(Array.from(res.multipliers)).toEqual([]);
  });

  it('solves a hand-computed 3×3 system', () => {
    // P x* = −q with x* = [1, −1, 2]: P = [[4,1,0],[1,3,1],[0,1,2]],
    // P x* = [3, 0, 3] ⇒ q = [−3, 0, −3].
    const p = Float64Array.from([4, 1, 0, 1, 3, 1, 0, 1, 2]);
    const q = Float64Array.from([-3, 0, -3]);
    const res = solveQp(p, q, null, null, 3, 0);
    expect(res.found).toBe(true);
    const expected = [1, -1, 2];
    for (let i = 0; i < 3; i++) {
      expect(Math.abs((res.x[i] ?? 0) - (expected[i] ?? 0))).toBeLessThanOrEqual(1e-10);
    }
  });

  it('treats m = 0 with empty G the same as null G', () => {
    const p = Float64Array.from([2, 0, 0, 4]);
    const q = Float64Array.from([-2, -8]);
    const res = solveQp(p, q, new Float64Array(0), new Float64Array(0), 2, 0);
    expect(res.found).toBe(true);
    expect(Math.abs((res.x[0] ?? 0) - 1)).toBeLessThanOrEqual(1e-12);
  });
});

// ── 2. Single active constraint, analytic solution ─────────────────────────

describe('single constraint', () => {
  it('projects onto an active constraint: min ½‖x‖² − [1,1]ᵀx s.t. x₁+x₂ ≤ 1', () => {
    const p = Float64Array.from([1, 0, 0, 1]);
    const q = Float64Array.from([-1, -1]);
    const g = Float64Array.from([1, 1]);
    const h = Float64Array.from([1]);
    const res = solveQp(p, q, g, h, 2, 1);
    expect(res.found).toBe(true);
    expect(res.iterations).toBeGreaterThan(0);
    expect(Math.abs((res.x[0] ?? 0) - 0.5)).toBeLessThanOrEqual(1e-10);
    expect(Math.abs((res.x[1] ?? 0) - 0.5)).toBeLessThanOrEqual(1e-10);
    // Analytic multiplier: x − [1,1] + λ[1,1] = 0 at x = [0.5, 0.5] ⇒ λ = 0.5.
    expect(Math.abs((res.multipliers[0] ?? 0) - 0.5)).toBeLessThanOrEqual(1e-10);
  });

  it('leaves an inactive constraint alone', () => {
    const p = Float64Array.from([1, 0, 0, 1]);
    const q = Float64Array.from([-1, -1]);
    const g = Float64Array.from([1, 1]);
    const h = Float64Array.from([5]); // unconstrained optimum [1,1] already feasible
    const res = solveQp(p, q, g, h, 2, 1);
    expect(res.found).toBe(true);
    expect(res.iterations).toBe(0);
    expect(Math.abs((res.x[0] ?? 0) - 1)).toBeLessThanOrEqual(1e-12);
    expect(res.multipliers[0]).toBe(0);
  });
});

// ── 3. Infeasibility detection ─────────────────────────────────────────────

describe('infeasible problems', () => {
  it('detects the contradictory pair x ≤ 0, −x ≤ −1', () => {
    const p = Float64Array.from([1]);
    const q = Float64Array.from([0]);
    const g = Float64Array.from([1, -1]);
    const h = Float64Array.from([0, -1]);
    const res = solveQp(p, q, g, h, 1, 2);
    expect(res.found).toBe(false);
  });

  it('detects an unsatisfiable zero row: 0·x ≤ −1', () => {
    const p = Float64Array.from([1]);
    const q = Float64Array.from([-2]);
    const g = Float64Array.from([0]);
    const h = Float64Array.from([-1]);
    const res = solveQp(p, q, g, h, 1, 1);
    expect(res.found).toBe(false);
  });
});

// ── 4. Random PD problems: verify KKT conditions directly ──────────────────

describe('random PD problems satisfy KKT', () => {
  for (const n of [2, 5, 10, 33]) {
    for (const mFactor of [0, 1, 2]) {
      const m = n * mFactor;
      it(`n=${n}, m=${m}`, () => {
        const rng = mulberry32(97 * n + m + 1);
        const p = randPd(rng, n);
        const q = randVec(rng, n, 3);
        const { g, h } = m > 0 ? randConstraints(rng, n, m) : { g: null, h: null };
        const res = solveQp(p, q, g, h, n, m);
        expect(res.found).toBe(true);
        expectKkt(p, q, g, h, n, m, res.x, res.multipliers);
      });
    }
  }
});

// ── 5. Cross-oracle vs MuJoCo's mju_boxQP ──────────────────────────────────

describe('cross-oracle vs MuJoCo mju_boxQP', () => {
  let mjc: MainModule;

  beforeAll(async () => {
    const mod = await import('@mujoco/mujoco');
    mjc = await mod.default();
  }, 30_000);

  /** G = [I; −I], h = [ub; −lb] encodes lb ≤ x ≤ ub. */
  function boxToIneq(
    lb: Float64Array,
    ub: Float64Array,
    n: number,
  ): { g: Float64Array; h: Float64Array } {
    const g = new Float64Array(2 * n * n);
    const h = new Float64Array(2 * n);
    for (let i = 0; i < n; i++) {
      g[i * n + i] = 1;
      g[(n + i) * n + i] = -1;
      h[i] = ub[i] ?? 0;
      h[n + i] = -(lb[i] ?? 0);
    }
    return { g, h };
  }

  for (const n of [2, 5, 10, 33]) {
    for (const seed of [1, 2, 3]) {
      it(`agrees on a box-constrained problem (n=${n}, seed=${seed})`, () => {
        const rng = mulberry32(7919 * n + seed);
        const p = randPd(rng, n);
        // Large q pushes the unconstrained optimum outside the box, so a mix
        // of bounds ends up active.
        const q = randVec(rng, n, 2 * n);
        const lb = new Float64Array(n);
        const ub = new Float64Array(n);
        const mid = new Float64Array(n);
        for (let i = 0; i < n; i++) {
          lb[i] = -(0.1 + rng());
          ub[i] = 0.1 + rng();
          mid[i] = ((lb[i] ?? 0) + (ub[i] ?? 0)) / 2;
        }

        const res = mjc.DoubleBuffer.FromArray(Array.from(mid)); // in-box initial guess
        const r = new mjc.DoubleBuffer(n * (n + 7));
        const index = new mjc.IntBuffer(n);
        const rank = mjc.mju_boxQP(
          res,
          r,
          index,
          Array.from(p),
          Array.from(q),
          Array.from(lb),
          Array.from(ub),
        );
        expect(rank).toBeGreaterThanOrEqual(0);
        const oracle = Float64Array.from(res.GetView() as Float64Array);
        res.delete();
        r.delete();
        index.delete();

        const { g, h } = boxToIneq(lb, ub, n);
        const sol = solveQp(p, q, g, h, n, 2 * n);
        expect(sol.found).toBe(true);
        for (let i = 0; i < n; i++) {
          expect(Math.abs((sol.x[i] ?? 0) - (oracle[i] ?? 0))).toBeLessThanOrEqual(1e-6);
        }
      });
    }
  }
});

// ── 6. Determinism ─────────────────────────────────────────────────────────

describe('determinism', () => {
  function build(): {
    p: Float64Array;
    q: Float64Array;
    g: Float64Array;
    h: Float64Array;
  } {
    const rng = mulberry32(424242);
    const p = randPd(rng, 10);
    const q = randVec(rng, 10, 3);
    const { g, h } = randConstraints(rng, 10, 20);
    return { p, q, g, h };
  }

  it('same inputs twice give bitwise-equal outputs', () => {
    const first = build();
    const a = solveQp(first.p, first.q, first.g, first.h, 10, 20);
    const second = build(); // freshly generated, identical inputs
    const b = solveQp(second.p, second.q, second.g, second.h, 10, 20);

    expect(b.found).toBe(a.found);
    expect(b.iterations).toBe(a.iterations);
    for (let i = 0; i < 10; i++) {
      expect(Object.is(a.x[i], b.x[i]), `x[${i}]`).toBe(true);
    }
    for (let i = 0; i < 20; i++) {
      expect(Object.is(a.multipliers[i], b.multipliers[i]), `λ[${i}]`).toBe(true);
    }
  });

  it('does not mutate its inputs', () => {
    const original = build();
    const copy = build();
    solveQp(original.p, original.q, original.g, original.h, 10, 20);
    expect(Array.from(original.p)).toEqual(Array.from(copy.p));
    expect(Array.from(original.q)).toEqual(Array.from(copy.q));
    expect(Array.from(original.g)).toEqual(Array.from(copy.g));
    expect(Array.from(original.h)).toEqual(Array.from(copy.h));
  });
});
