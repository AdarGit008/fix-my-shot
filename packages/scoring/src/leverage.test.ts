import { describe, expect, it } from 'vitest';
import type { PrincipleResult, Report } from '@fix-my-shot/core';
import { computeFixes, mulberry32, type EvaluateAt, type FixDecor } from './leverage';

// Synthetic-closure tests of the leverage engine: the evaluate closure builds
// reports by rule, so at-stake ranking, slope tie-breaks, feasibility
// fallbacks, and the stability gate are each exercised in isolation.

const decor = (principleId: string): FixDecor => ({
  cluster: 'base',
  cue: `cue for ${principleId}`,
});

interface Row {
  id: string;
  atStake: number;
  tier?: PrincipleResult['tier'];
  satisfied?: boolean;
  measured?: boolean;
}

function makeReport(rows: Row[]): Report {
  return {
    grade: 50,
    phase: 'p',
    fixes: [],
    principleResults: rows.map((row) => ({
      principleId: row.id,
      tier: row.tier ?? 'guideline',
      criterion: { kind: 'presence' as const },
      measured: row.measured ?? true,
      satisfied: row.satisfied ?? false,
      deduction: 0,
      atStake: row.atStake,
    })),
  };
}

const params = [
  { id: 'p1', deltaStep: 0.1 },
  { id: 'p2', deltaStep: 0.1 },
];

describe('computeFixes', () => {
  it('returns no fixes when nothing is violated', () => {
    const base = makeReport([{ id: 'a', atStake: 0, satisfied: true }]);
    const fixes = computeFixes(base, () => base, params, decor);
    expect(fixes).toEqual([]);
  });

  it('excludes style-variant flags and unmeasured principles from fixes', () => {
    const base = makeReport([
      { id: 'style', atStake: 0, tier: 'style-variant' },
      { id: 'ghost', atStake: 0, measured: false },
      { id: 'real', atStake: 10 },
    ]);
    const fixes = computeFixes(base, () => base, params, decor);
    expect(fixes.map((f) => f.principleId)).toEqual(['real']);
    expect(fixes[0]!.cluster).toBe('base');
    expect(fixes[0]!.cue).toBe('cue for real');
  });

  it('ranks by points at stake, slope breaking near-ties', () => {
    // a and b hold identical stakes; only b responds to parameter p1 (linear —
    // a symmetric |p1| would put the base pose at a kink where a central
    // difference rightly reads zero).
    const reportAt = (p1: number): Report =>
      makeReport([
        { id: 'a', atStake: 10 },
        { id: 'b', atStake: 10 + p1 * 30 },
      ]);
    const evaluate: EvaluateAt = (deltas) => reportAt(deltas['p1'] ?? 0);
    const fixes = computeFixes(reportAt(0), evaluate, params, decor, { jitters: 0 });
    expect(fixes.map((f) => f.principleId)).toEqual(['b', 'a']);
    expect(fixes[0]!.leverage).toBeGreaterThan(fixes[1]!.leverage);
  });

  it('falls back to a one-sided difference at a feasibility edge', () => {
    const base = makeReport([{ id: 'a', atStake: 10 }]);
    const evaluate: EvaluateAt = (deltas) => {
      const p1 = deltas['p1'] ?? 0;
      if (p1 > 0) return null; // + side infeasible
      return makeReport([{ id: 'a', atStake: 10 + Math.abs(p1) * 40 }]);
    };
    const fixes = computeFixes(base, evaluate, params, decor, { jitters: 0 });
    // One-sided slope: |14 − 10| = 4 → leverage 10 + 4.
    expect(fixes[0]!.leverage).toBeCloseTo(14);
  });

  it('suppresses a fix whose rank jumps more than one position across contexts', () => {
    // c reads tiny at the base pose but dominates in EVERY jittered context —
    // exactly the noise-teaching instability the gate must remove.
    const evaluate: EvaluateAt = (deltas) => {
      const jittered = Object.values(deltas).some((d) => d !== 0);
      return makeReport([
        { id: 'a', atStake: 30 },
        { id: 'b', atStake: 20 },
        { id: 'c', atStake: jittered ? 50 : 1 },
      ]);
    };
    const base = evaluate({})!;
    const fixes = computeFixes(base, evaluate, params, decor, { jitters: 3 });
    expect(fixes.map((f) => f.principleId)).toEqual(['a', 'b']);
  });

  it('is deterministic for a fixed seed and stable across equal runs', () => {
    const evaluate: EvaluateAt = (deltas) =>
      makeReport([
        { id: 'a', atStake: 12 + (deltas['p1'] ?? 0) * 5 },
        { id: 'b', atStake: 12 + (deltas['p2'] ?? 0) * 5 },
      ]);
    const base = evaluate({})!;
    const one = computeFixes(base, evaluate, params, decor);
    const two = computeFixes(base, evaluate, params, decor);
    expect(one).toEqual(two);
  });

  it('mulberry32 reproduces its stream', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
