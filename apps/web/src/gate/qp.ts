// Dense convex QP solver for the physical-validity gate (issue #9).
//
//   minimize    ½ xᵀPx + qᵀx
//   subject to  Gx ≤ h
//
// with P symmetric positive-definite (callers guarantee a damping term
// ≥ 1e-12 on the diagonal). Original implementation of the dual active-set
// method of:
//
//   D. Goldfarb & A. Idnani (1983), "A numerically stable dual method for
//   solving strictly convex quadratic programs", Mathematical Programming
//   27, pp. 1–33.
//
// This is the same algorithm family as daqp, the QP backend mink delegates
// to via qpsolvers — but this file is NOT a mink port; it is original work.
// Sizes here are tiny (n ≈ 33, m ≈ 70), so every active-set change simply
// refactorizes from scratch: correctness over cleverness.
//
// Algorithm sketch: start at the unconstrained minimum x = −P⁻¹q (Cholesky).
// Repeatedly pick the most-violated inequality p and drive its multiplier up
// from zero. Moving along the constrained Newton direction either satisfies p
// exactly (full step → p joins the active set) or first drives an active
// multiplier to zero (partial step → that constraint drops out). If neither a
// primal nor a dual step is possible the dual is unbounded, which certifies
// primal infeasibility.

/** Violation tolerance, scaled per row by (1 + |hᵢ|). */
const VIOL_TOL = 1e-9;

/** Relative threshold deciding whether a candidate constraint normal is
 * linearly independent of the active set (nᵖᵀH nᵖ vs nᵖᵀP⁻¹nᵖ). */
const INDEP_TOL = 1e-12;

/** Dual step directions below this are treated as non-blocking. */
const DUAL_TOL = 1e-12;

export interface QpResult {
  /** Primal solution (meaningful only when `found` is true). */
  x: Float64Array;
  /** True iff a KKT point was found; false certifies infeasibility (dual
   * unbounded), a numerical failure, or hitting the iteration cap. */
  found: boolean;
  /** Number of active-set steps taken (0 for unconstrained problems). */
  iterations: number;
  /** Lagrange multipliers λ ≥ 0, one per inequality row (0 when inactive). */
  multipliers: Float64Array;
}

/** In-place-free Cholesky factorization A = LLᵀ (L lower-triangular,
 * row-major). Returns null when A is not numerically positive-definite. */
function cholesky(a: Float64Array, n: number): Float64Array | null {
  const l = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = a[i * n + j] ?? 0;
      for (let k = 0; k < j; k++) s -= (l[i * n + k] ?? 0) * (l[j * n + k] ?? 0);
      if (i === j) {
        if (s <= 0) return null;
        l[i * n + i] = Math.sqrt(s);
      } else {
        l[i * n + j] = s / (l[j * n + j] ?? 1);
      }
    }
  }
  return l;
}

/** Solve L y = b (forward substitution). */
function forwardSolve(l: Float64Array, b: Float64Array, n: number): Float64Array {
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i] ?? 0;
    for (let k = 0; k < i; k++) s -= (l[i * n + k] ?? 0) * (y[k] ?? 0);
    y[i] = s / (l[i * n + i] ?? 1);
  }
  return y;
}

/** Solve Lᵀ x = y (backward substitution against the lower factor). */
function backSolve(l: Float64Array, y: Float64Array, n: number): Float64Array {
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i] ?? 0;
    for (let k = i + 1; k < n; k++) s -= (l[k * n + i] ?? 0) * (x[k] ?? 0);
    x[i] = s / (l[i * n + i] ?? 1);
  }
  return x;
}

/** Solve LLᵀ x = b. */
function cholSolve(l: Float64Array, b: Float64Array, n: number): Float64Array {
  return backSolve(l, forwardSolve(l, b, n), n);
}

function dot(a: Float64Array, b: Float64Array, n: number): number {
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

/** Row `i` of the row-major m×n matrix G, copied into a dense vector. */
function gRow(g: Float64Array, i: number, n: number): Float64Array {
  return g.subarray(i * n, (i + 1) * n).slice();
}

/**
 * Solve min ½xᵀPx + qᵀx s.t. Gx ≤ h with P symmetric positive-definite.
 *
 * @param p row-major n×n cost matrix (symmetric PD)
 * @param q length-n cost vector
 * @param g row-major m×n inequality matrix, or null when unconstrained
 * @param h length-m inequality bounds, or null when unconstrained
 * @param n number of variables
 * @param m number of inequality rows (0 means unconstrained)
 *
 * Deterministic: no randomness, ties broken by lowest constraint index.
 * Inputs are never mutated.
 */
export function solveQp(
  p: Float64Array,
  q: Float64Array,
  g: Float64Array | null,
  h: Float64Array | null,
  n: number,
  m: number,
): QpResult {
  const multipliers = new Float64Array(m);
  const l = cholesky(p, n);
  if (l === null) {
    return { x: new Float64Array(n), found: false, iterations: 0, multipliers };
  }

  // Unconstrained minimum x = −P⁻¹q.
  const negQ = new Float64Array(n);
  for (let i = 0; i < n; i++) negQ[i] = -(q[i] ?? 0);
  const x = cholSolve(l, negQ, n);
  let iterations = 0;
  if (m === 0 || g === null || h === null) {
    return { x, found: true, iterations, multipliers };
  }

  const active: number[] = []; // indices of active inequality rows
  const lambda: number[] = []; // multipliers, parallel to `active`
  const maxIterations = 10 * (n + m);

  outer: for (;;) {
    // Most-violated inactive constraint (raw violation, lowest index on ties).
    let pick = -1;
    let worst = 0;
    for (let i = 0; i < m; i++) {
      if (active.includes(i)) continue;
      const hi = h[i] ?? 0;
      const s = dot(gRow(g, i, n), x, n) - hi;
      if (s > VIOL_TOL * (1 + Math.abs(hi)) && s > worst) {
        worst = s;
        pick = i;
      }
    }
    if (pick === -1) {
      active.forEach((row, j) => {
        multipliers[row] = lambda[j] ?? 0;
      });
      return { x, found: true, iterations, multipliers };
    }

    // Drive the multiplier of `pick` up from zero, dropping any active
    // constraint whose multiplier a partial (dual) step sends to zero.
    let u = 0; // accumulated multiplier for the incoming constraint
    for (;;) {
      if (++iterations > maxIterations) {
        return { x, found: false, iterations, multipliers };
      }

      const np = gRow(g, pick, n);
      const yp = forwardSolve(l, np, n); // L yp = nᵖ, so nᵖᵀP⁻¹nᵖ = ypᵀyp
      const k = active.length;

      // Full refactorization of the active-set system each step (n is tiny):
      // Y column j = L⁻¹ nₐⱼ, S = YᵀY = NᵀP⁻¹N, dual direction r = S⁻¹NᵀP⁻¹nᵖ,
      // primal direction z = P⁻¹(nᵖ − N r) = H nᵖ.
      const y = new Float64Array(n * k);
      for (let j = 0; j < k; j++) {
        const col = forwardSolve(l, gRow(g, active[j] ?? 0, n), n);
        for (let i = 0; i < n; i++) y[i * k + j] = col[i] ?? 0;
      }
      const r = new Float64Array(k);
      if (k > 0) {
        const s = new Float64Array(k * k);
        for (let a = 0; a < k; a++) {
          for (let b = a; b < k; b++) {
            let acc = 0;
            for (let i = 0; i < n; i++) acc += (y[i * k + a] ?? 0) * (y[i * k + b] ?? 0);
            s[a * k + b] = acc;
            s[b * k + a] = acc;
          }
        }
        const ls = cholesky(s, k);
        if (ls === null) {
          // Active normals numerically dependent — the invariant is broken.
          return { x, found: false, iterations, multipliers };
        }
        const rhs = new Float64Array(k);
        for (let j = 0; j < k; j++) {
          let acc = 0;
          for (let i = 0; i < n; i++) acc += (y[i * k + j] ?? 0) * (yp[i] ?? 0);
          rhs[j] = acc;
        }
        const sol = cholSolve(ls, rhs, k);
        r.set(sol);
      }
      const w = new Float64Array(n); // yp − Y r
      for (let i = 0; i < n; i++) {
        let acc = yp[i] ?? 0;
        for (let j = 0; j < k; j++) acc -= (y[i * k + j] ?? 0) * (r[j] ?? 0);
        w[i] = acc;
      }
      const z = backSolve(l, w, n);
      const npz = dot(np, z, n); // nᵖᵀ H nᵖ ≥ 0; > 0 iff nᵖ ∉ span(N)
      const independent = npz > INDEP_TOL * dot(yp, yp, n);

      // Full (primal) step length: satisfies constraint `pick` exactly.
      const sp = dot(np, x, n) - (h[pick] ?? 0);
      const t1 = independent ? sp / npz : Infinity;
      // Partial (dual) step length: first active multiplier driven to zero.
      let t2 = Infinity;
      let blocker = -1;
      for (let j = 0; j < k; j++) {
        const rj = r[j] ?? 0;
        if (rj > DUAL_TOL) {
          const cand = (lambda[j] ?? 0) / rj;
          if (cand < t2) {
            t2 = cand;
            blocker = j;
          }
        }
      }

      const t = Math.min(t1, t2);
      if (t === Infinity) {
        // No primal or dual step possible: dual unbounded ⇒ primal infeasible.
        return { x, found: false, iterations, multipliers };
      }

      // Step: x ← x − t·z, λ ← λ − t·r, u ← u + t.
      if (independent) {
        for (let i = 0; i < n; i++) x[i] = (x[i] ?? 0) - t * (z[i] ?? 0);
      }
      for (let j = 0; j < k; j++) lambda[j] = (lambda[j] ?? 0) - t * (r[j] ?? 0);
      u += t;

      if (t1 <= t2) {
        active.push(pick);
        lambda.push(u);
        continue outer;
      }
      active.splice(blocker, 1);
      lambda.splice(blocker, 1);
    }
  }
}
