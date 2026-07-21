// @fix-my-shot/scoring — measurement + phase-aware range scorer + report model (ADR-0008).
//
// Sport-agnostic: depends on @fix-my-shot/core only. The objective (which principles,
// which ranges) is injected by a sport plugin, so scoring never names a sport. This
// scaffold implements the band-width-normalized guideline deduction from ADR-0008; the
// written-in-stone violation cap, leverage, and ranked report land in issues #11/#12.

import { inRange, type FormObjective, type PrincipleRange } from '@fix-my-shot/core';

/** A single principle's contribution to the grade when it falls out of range. */
export interface Deduction {
  readonly principle: string;
  readonly measured: number;
  readonly points: number;
}

/** The result of grading a set of measured values against an objective. */
export interface FormGrade {
  /** A 0–100 form grade — NOT a probability (ADR-0008). */
  readonly score: number;
  readonly deductions: readonly Deduction[];
}

/**
 * Grade measured values against an objective. In-range principles never deduct;
 * out-of-range principles deduct in proportion to how far past the band edge they sit,
 * normalized by band width (ADR-0008).
 * @throws {Error} when a principle in the objective has no measurement.
 */
export function grade(
  objective: FormObjective,
  measured: Readonly<Record<string, number>>,
): FormGrade {
  const deductions: Deduction[] = [];
  for (const principle of objective.principles) {
    const value = measured[principle.id];
    if (value === undefined) {
      throw new Error(`no measurement supplied for principle '${principle.id}'`);
    }
    if (!inRange(principle, value)) {
      deductions.push({
        principle: principle.id,
        measured: value,
        points: deduct(principle, value),
      });
    }
  }
  const total = deductions.reduce((sum, d) => sum + d.points, 0);
  return { score: Math.max(0, 100 - total), deductions };
}

/** Band-width-normalized deduction for an out-of-range value (ADR-0008 guideline tier). */
function deduct(principle: PrincipleRange, value: number): number {
  const width = principle.max - principle.min;
  const outBy = value < principle.min ? principle.min - value : value - principle.max;
  return width > 0 ? Math.min(100, (outBy / width) * 100) : 100;
}
