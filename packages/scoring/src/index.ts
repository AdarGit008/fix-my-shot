// @fix-my-shot/scoring — measurement layer + phase-aware scorer + report production (ADR-0008).
//
// Sport-agnostic: depends on @fix-my-shot/core only. The objective (which principles, which
// ranges) is injected by a sport plugin, so scoring never names a sport. Issue #7 fixes the
// interfaces the other packages implement and ships a reference band scorer; the full gate +
// finite-difference leverage and the ranked BEEF report land in issues #11/#12.

import {
  inRange,
  type FormObjective,
  type Pose,
  type Principle,
  type PrincipleResult,
  type Report,
} from '@fix-my-shot/core';

/**
 * A reading taken from a pose for one principle: numeric for a `band` criterion, boolean
 * for `presence` / `direction` / `symmetry` (ADR-0008 — proxies score presence/direction,
 * never a degree).
 */
export type Measurement = number | boolean;

/** The readings for a pose, keyed by principle id. */
export type Measurements = Readonly<Record<string, Measurement>>;

/**
 * The measurement layer: reads the phase-appropriate quantities off a pose. Its geometry
 * implementation (3-point joint angles, segment-vs-gravity, COM-in-support) lands with the
 * scorer (#11); the seam only fixes the shape here.
 */
export interface Measurer {
  measure(pose: Pose, objective: FormObjective): Measurements;
}

/** Grades a pose against an objective, given its measurements, into a Report (ADR-0009). */
export interface Scorer {
  score(pose: Pose, objective: FormObjective, measurements: Measurements): Report;
}

/**
 * Guideline-weight deduction for a failed proxy (presence / direction / symmetry). A
 * placeholder constant until the finite-difference scorer (#11) sets it from evidence.
 */
const PROXY_DEDUCTION = 25;

/**
 * Reference scorer (ADR-0008). Only principles whose phase matches the pose's labelled
 * phase contribute (a marker not applicable to the phase contributes nothing). In-range /
 * style-variant never deduct; a guideline violation subtracts a band-width-normalized
 * deduction; a written-in-stone violation caps the grade (the ceiling falls with violation
 * depth). Leverage-ranked fixes are produced by the finite-difference engine in #12.
 * @throws {Error} when an applicable principle has no measurement.
 */
export function grade(pose: Pose, objective: FormObjective, measurements: Measurements): Report {
  const principleResults: PrincipleResult[] = [];
  let cap = 100;
  let deductionTotal = 0;

  for (const principle of objective.principles) {
    if (principle.phase !== pose.phase.id) {
      continue;
    }
    const measurement = measurements[principle.id];
    if (measurement === undefined) {
      throw new Error(`no measurement supplied for principle '${principle.id}'`);
    }
    const { satisfied, deduction } = evaluate(principle, measurement);
    principleResults.push({
      principleId: principle.id,
      tier: principle.tier,
      criterion: principle.criterion,
      satisfied,
      deduction,
    });
    if (!satisfied) {
      if (principle.tier === 'written-in-stone') {
        cap = Math.min(cap, Math.max(0, 100 - deduction));
      } else if (principle.tier === 'guideline') {
        deductionTotal += deduction;
      }
      // style-variant is never deducted.
    }
  }

  const gradeValue = Math.max(0, Math.min(cap, 100 - deductionTotal));
  return { grade: gradeValue, phase: pose.phase.id, principleResults, fixes: [] };
}

/** Evaluate one principle's measurement into a (satisfied, deduction) pair. */
function evaluate(
  principle: Principle,
  measurement: Measurement,
): { satisfied: boolean; deduction: number } {
  const criterion = principle.criterion;
  switch (criterion.kind) {
    case 'band': {
      if (typeof measurement !== 'number') {
        throw new TypeError(`principle '${principle.id}' needs a numeric measurement`);
      }
      const satisfied = inRange(criterion, measurement);
      return { satisfied, deduction: satisfied ? 0 : bandDeduction(criterion, measurement) };
    }
    case 'presence':
    case 'direction':
    case 'symmetry': {
      if (typeof measurement !== 'boolean') {
        throw new TypeError(`principle '${principle.id}' needs a boolean measurement`);
      }
      return { satisfied: measurement, deduction: measurement ? 0 : PROXY_DEDUCTION };
    }
    case 'qualitative':
      // Carried as context/data; not numerically scored in v1, so it never deducts here.
      return { satisfied: true, deduction: 0 };
  }
}

/** Band-width-normalized deduction for an out-of-range value (ADR-0008 guideline tier). */
function bandDeduction(band: { min: number; max: number }, value: number): number {
  const width = band.max - band.min;
  const outBy = value < band.min ? band.min - value : value - band.max;
  return width > 0 ? Math.min(100, (outBy / width) * 100) : 100;
}
