// Interactive finite-difference leverage + the ranked fix list (issue #12,
// ADR-0008). Sport-agnostic orchestration: the caller supplies an evaluation
// closure over its editable parameters (the app wires the engine, phase
// bounds, grounding and gate feasibility behind it) and a decor lookup (the
// sport plugin's cluster + external-focus cue per principle).
//
// Ranking model — the two components, composed per candidate fix:
//   at-stake  — the points the violated principle is holding down right now
//               (the report's own atStake: stone ceiling loss / guideline
//               deduction). Binary proxies have no local slope, but their
//               stake is real; without this term a presence fault could never
//               out-rank a band fault it dwarfs.
//   slope     — the finite-difference sensitivity of that stake to one
//               δ-step of the most effective editable parameter (central
//               difference, one-sided at a feasibility edge). This is the
//               ADR's "sensitivity of the form score to small, gate-feasible
//               perturbations of each editable parameter", and it orders
//               fixes the at-stake term ties.
//
// Stability gate (ADR-0008 load-bearing clause, SPEC acceptance #5): the whole
// ranking is recomputed under K seeded, feasible micro-jitters of the base
// pose; a fix whose rank RANGE across contexts exceeds 1 is SUPPRESSED (it
// would teach noise), and the surviving order uses the median leverage across
// contexts, so near-identical poses produce the same top fix.

import type { RankedFix, Report } from '@fix-my-shot/core';

/** One editable parameter the FD loop may perturb, and its step size. */
export interface ParamSpec {
  readonly id: string;
  /** FD step in the parameter's own units (rad, metres, …). */
  readonly deltaStep: number;
}

/**
 * Evaluate the pose with the given parameter deltas applied to the BASE pose
 * (empty map = the base itself). Returns null when the perturbed pose is
 * infeasible (outside the phase envelope or gate-invalid) — the FD loop then
 * falls back to a one-sided difference or drops the direction.
 */
export type EvaluateAt = (deltas: Readonly<Record<string, number>>) => Report | null;

/** The sport plugin's display decor for one principle. */
export interface FixDecor {
  readonly cluster: string;
  readonly cue: string;
}

export interface LeverageOptions {
  /** Stability-gate contexts beyond the base pose. */
  readonly jitters?: number;
  /** Seed for the deterministic jitter stream. */
  readonly seed?: number;
  /** Jitter magnitude as a fraction of each parameter's deltaStep. */
  readonly jitterScale?: number;
  /** Max resample attempts per jitter context that lands infeasible. */
  readonly jitterRetries?: number;
  /**
   * Stricter evaluator for the stability CONTEXTS (they are poses in their own
   * right — the app validates them through the full gate), while `evaluate`
   * may use a cheaper feasibility path for the ε-neighbourhood FD probes.
   * Defaults to `evaluate`.
   */
  readonly evaluateContext?: EvaluateAt;
}

/** Deterministic 32-bit PRNG (mulberry32) — the jitter stream must reproduce. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEFAULT_SEED = 0x5eed_f1c5;

function atStakeOf(report: Report, principleId: string): number {
  return report.principleResults.find((r) => r.principleId === principleId)?.atStake ?? 0;
}

/** Rank positions (0-based) for candidate ids by descending leverage; ties by id. */
function rankOrder(leverage: ReadonlyMap<string, number>): string[] {
  return [...leverage.keys()].sort(
    (a, b) => leverage.get(b)! - leverage.get(a)! || a.localeCompare(b),
  );
}

/**
 * Compute the ranked, stability-gated fix list for a graded pose (ADR-0008).
 * Candidates are the base report's violated, measured, deducting-tier
 * principles (a flagged style-variant is legitimate variation — nothing to
 * fix; an unmeasured principle must never become advice). Deterministic for a
 * given (base pose, params, options).
 */
export function computeFixes(
  baseReport: Report,
  evaluate: EvaluateAt,
  params: readonly ParamSpec[],
  decor: (principleId: string) => FixDecor,
  options: LeverageOptions = {},
): RankedFix[] {
  const jitters = options.jitters ?? 3;
  const jitterScale = options.jitterScale ?? 0.5;
  const jitterRetries = options.jitterRetries ?? 3;
  const evaluateContext = options.evaluateContext ?? evaluate;
  const rng = mulberry32(options.seed ?? DEFAULT_SEED);

  const candidates = baseReport.principleResults
    .filter((r) => !r.satisfied && r.measured && r.tier !== 'style-variant')
    .map((r) => r.principleId);
  if (candidates.length === 0) return [];

  // Contexts: the base pose plus K feasible micro-jitters.
  const contexts: { deltas: Record<string, number>; report: Report }[] = [
    { deltas: {}, report: baseReport },
  ];
  for (let j = 0; j < jitters; j++) {
    for (let attempt = 0; attempt <= jitterRetries; attempt++) {
      const deltas: Record<string, number> = {};
      for (const p of params) {
        deltas[p.id] = (rng() * 2 - 1) * jitterScale * p.deltaStep;
      }
      const report = evaluateContext(deltas);
      if (report) {
        contexts.push({ deltas, report });
        break;
      }
    }
  }

  // Per-context leverage: at-stake + best parameter slope of that stake.
  const perContext: Map<string, number>[] = [];
  for (const context of contexts) {
    const leverage = new Map<string, number>();
    const slopes = new Map<string, number>();
    for (const candidate of candidates) slopes.set(candidate, 0);

    for (const p of params) {
      const plus = evaluate({ ...context.deltas, [p.id]: (context.deltas[p.id] ?? 0) + p.deltaStep });
      const minus = evaluate({
        ...context.deltas,
        [p.id]: (context.deltas[p.id] ?? 0) - p.deltaStep,
      });
      if (!plus && !minus) continue;
      for (const candidate of candidates) {
        const here = atStakeOf(context.report, candidate);
        let slope: number;
        if (plus && minus) {
          slope = Math.abs(atStakeOf(plus, candidate) - atStakeOf(minus, candidate)) / 2;
        } else {
          const side = (plus ?? minus)!;
          slope = Math.abs(atStakeOf(side, candidate) - here);
        }
        if (slope > slopes.get(candidate)!) slopes.set(candidate, slope);
      }
    }
    for (const candidate of candidates) {
      leverage.set(candidate, atStakeOf(context.report, candidate) + slopes.get(candidate)!);
    }
    perContext.push(leverage);
  }

  // Stability gate: suppress any fix whose rank position ranges wider than 1
  // across contexts; order survivors by median leverage (ties by id).
  const ranks = new Map<string, number[]>(candidates.map((c) => [c, []]));
  for (const leverage of perContext) {
    const order = rankOrder(leverage);
    order.forEach((id, position) => ranks.get(id)!.push(position));
  }
  const stable = candidates.filter((c) => {
    const positions = ranks.get(c)!;
    return Math.max(...positions) - Math.min(...positions) <= 1;
  });

  const median = (xs: number[]): number => {
    const sorted = [...xs].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  };
  const robust = new Map<string, number>(
    stable.map((c) => [c, median(perContext.map((ctx) => ctx.get(c)!))]),
  );

  return rankOrder(robust).map((principleId) => {
    const { cluster, cue } = decor(principleId);
    return { principleId, cluster, cue, leverage: robust.get(principleId)! };
  });
}
