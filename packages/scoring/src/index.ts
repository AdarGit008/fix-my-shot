// @fix-my-shot/scoring — measurement layer + phase-aware scorer + report production (ADR-0008).
//
// Sport-agnostic: depends on @fix-my-shot/core only. The objective (which principles, which
// ranges) and the measurement recipes (how a principle is read off a world snapshot) are
// injected by a sport plugin, so scoring never names a sport. Issue #7 fixed these seams;
// issue #11 lands the real measurement layer + ADR-0008 aggregation semantics; the
// finite-difference leverage + ranked BEEF report land in issue #12.

import {
  inRange,
  type Criterion,
  type FormObjective,
  type Pose,
  type PoseSnapshot,
  type Principle,
  type PrincipleResult,
  type Report,
} from '@fix-my-shot/core';

export {
  alongM,
  angle3Deg,
  distanceM,
  distanceOutsideConvexPolygon,
  horizontalAngleBetweenDeg,
  horizontalDistanceM,
  lateralOffsetM,
  pointInConvexPolygon,
  segmentVsVerticalDeg,
  signedTiltTowardDeg,
  type Vec2,
} from './geometry';
export {
  computeFixes,
  mulberry32,
  type EvaluateAt,
  type FixDecor,
  type LeverageOptions,
  type ParamSpec,
} from './leverage';

/**
 * A reading taken from a pose for one principle: numeric for a `band` criterion, boolean
 * for `presence` / `direction` / `symmetry` (ADR-0008 — proxies score presence/direction,
 * never a degree). `null` = the current body model cannot read this principle at all
 * (reported unmeasured, never deducted, never a fix).
 */
export type Measurement = number | boolean;

/** The readings for a pose, keyed by principle id (`null` = unmeasurable). */
export type Measurements = Readonly<Record<string, Measurement | null>>;

/**
 * How one principle is read off a world snapshot. Supplied per sport
 * (ADR-0006): the recipe knows the plugin's landmark names; scoring only runs
 * it. Returns `null` when the body model lacks the sensor for this principle.
 */
export type Recipe = (snapshot: PoseSnapshot) => Measurement | null;

/** The sport plugin's measurement layer: one recipe per measured principle id. */
export type RecipeBook = Readonly<Record<string, Recipe>>;

/**
 * The measurement layer: reads the phase-appropriate quantities off a pose. The engine
 * adapter (apps) produces the PoseSnapshot; the sport plugin supplies the recipes.
 */
export interface Measurer {
  measure(snapshot: PoseSnapshot, objective: FormObjective): Measurements;
}

/** Grades a pose against an objective, given its measurements, into a Report (ADR-0009). */
export interface Scorer {
  score(pose: Pose, objective: FormObjective, measurements: Measurements): Report;
}

/**
 * Run the phase-appropriate recipes over a snapshot (ADR-0008: a marker not
 * applicable to the labelled phase contributes nothing, so it is not even
 * measured). `qualitative` principles carry no recipe and no measurement — the
 * scorer treats them as context. A missing recipe for any other criterion kind
 * is a wiring error and throws.
 */
export function measureAll(
  snapshot: PoseSnapshot,
  objective: FormObjective,
  recipes: RecipeBook,
): Measurements {
  const out: Record<string, Measurement | null> = {};
  for (const principle of objective.principles) {
    if (principle.phase !== snapshot.phase) continue;
    if (principle.criterion.kind === 'qualitative') continue;
    const recipe = recipes[principle.id];
    if (!recipe) {
      throw new Error(`no recipe supplied for measurable principle '${principle.id}'`);
    }
    out[principle.id] = recipe(snapshot);
  }
  return out;
}

// ---------------------------------------------------------------------------
// ADR-0008 aggregation. The SHAPE and invariants are fixed by the ADR; the
// constants below are calibration parameters of the scorer build (tuned so the
// shipped clean library grades high and every injected fault reads as its
// principle — see the apps/web library integration tests), NOT evidence values.
// ---------------------------------------------------------------------------

/** Hard floor of the stone cap: no broken fundamental can grade above
 * STONE_CAP_FLOOR + STONE_CAP_RANGE, and none below STONE_CAP_FLOOR. */
export const STONE_CAP_FLOOR = 25;
/** Cap head-room above the floor at zero violation depth. */
export const STONE_CAP_RANGE = 35;
/** Initial slope of a guideline band deduction per unit depth (outBy ÷ width). */
export const GUIDELINE_SCALE = 15;
/** Asymptote of a guideline band deduction. */
export const GUIDELINE_CAP = 25;
/** Flat guideline-weight deduction for a failed presence/direction/symmetry proxy. */
export const PROXY_DEDUCTION = 12;

/**
 * Violation depth for a band criterion: distance outside ÷ band width
 * (ADR-0008's normalization — wide/soft bands penalize gently, tight bands
 * bite). Deliberately UNclamped: the penalty curves below taper smoothly
 * instead, so the score keeps a usable finite-difference gradient (#12's
 * leverage) even on gross violations rather than flat-lining at a cap.
 */
function bandDepth(band: { min: number; max: number }, value: number): number {
  const width = band.max - band.min;
  if (width <= 0) return 1;
  const outBy = value < band.min ? band.min - value : value - band.max;
  return outBy / width;
}

/** Stone ceiling at a violation depth: 60 at depth 0⁺, asymptotically 25 —
 * always below any clean-pose grade, always strictly falling (leverage-visible). */
export function stoneCap(depth: number): number {
  return STONE_CAP_FLOOR + STONE_CAP_RANGE * Math.exp(-depth);
}

/** Guideline band deduction at a violation depth: initial slope
 * GUIDELINE_SCALE, asymptote GUIDELINE_CAP — monotone, never saturating flat. */
export function guidelineDeduction(depth: number): number {
  return GUIDELINE_CAP * (1 - Math.exp(-(GUIDELINE_SCALE / GUIDELINE_CAP) * depth));
}

interface Evaluation {
  measured: boolean;
  satisfied: boolean;
  /** Normalized violation depth in [0, 1] (0 when satisfied). */
  depth: number;
}

/** Evaluate one principle's measurement into (measured, satisfied, depth). */
function evaluate(principle: Principle, measurement: Measurement | null): Evaluation {
  const criterion: Criterion = principle.criterion;
  if (criterion.kind === 'qualitative') {
    // Carried as context/data; never scored, but it WAS considered.
    return { measured: true, satisfied: true, depth: 0 };
  }
  if (measurement === null) {
    // The body model has no sensor for this principle: honest, never deducted.
    return { measured: false, satisfied: true, depth: 0 };
  }
  switch (criterion.kind) {
    case 'band': {
      if (typeof measurement !== 'number') {
        throw new TypeError(`principle '${principle.id}' needs a numeric measurement`);
      }
      const satisfied = inRange(criterion, measurement);
      return { measured: true, satisfied, depth: satisfied ? 0 : bandDepth(criterion, measurement) };
    }
    case 'presence':
    case 'direction':
    case 'symmetry': {
      if (typeof measurement !== 'boolean') {
        throw new TypeError(`principle '${principle.id}' needs a boolean measurement`);
      }
      return { measured: true, satisfied: measurement, depth: measurement ? 0 : 1 };
    }
  }
}

/** The deduction a violation carries, by tier and criterion kind (ADR-0008). */
function deductionFor(principle: Principle, depth: number): number {
  if (principle.tier !== 'guideline') return 0; // stones cap instead; style never deducts
  if (principle.criterion.kind === 'band') {
    return guidelineDeduction(depth);
  }
  return PROXY_DEDUCTION;
}

/**
 * Reference scorer (ADR-0008). Only principles whose phase matches the pose's labelled
 * phase contribute. In-range / style-variant never deduct (an out-of-envelope style
 * reading is FLAGGED — satisfied false, deduction 0). A guideline violation subtracts a
 * band-width-normalized deduction (flat PROXY_DEDUCTION for proxies); a written-in-stone
 * violation caps the grade, the ceiling falling with violation depth, so a broken
 * fundamental can never be buried under many small greens. Unmeasurable principles
 * (`null`) are reported with `measured: false` and contribute nothing. Deterministic.
 * @throws {Error} when an applicable principle has no measurement entry at all.
 */
export function grade(pose: Pose, objective: FormObjective, measurements: Measurements): Report {
  const principleResults: PrincipleResult[] = [];
  let cap = 100;
  let deductionTotal = 0;

  for (const principle of objective.principles) {
    if (principle.phase !== pose.phase.id) {
      continue;
    }
    const measurement =
      principle.criterion.kind === 'qualitative' ? true : measurements[principle.id];
    if (measurement === undefined) {
      throw new Error(`no measurement supplied for principle '${principle.id}'`);
    }
    const { measured, satisfied, depth } = evaluate(principle, measurement);
    let deduction = 0;
    let atStake = 0;
    if (!satisfied) {
      if (principle.tier === 'written-in-stone') {
        const ceiling = stoneCap(depth);
        cap = Math.min(cap, ceiling);
        atStake = 100 - ceiling;
      } else if (principle.tier === 'guideline') {
        deduction = deductionFor(principle, depth);
        deductionTotal += deduction;
        atStake = deduction;
      }
      // style-variant: flagged (satisfied false), never deducted.
    }
    principleResults.push({
      principleId: principle.id,
      tier: principle.tier,
      criterion: principle.criterion,
      measured,
      satisfied,
      deduction,
      atStake,
    });
  }

  const gradeValue = Math.max(0, Math.min(cap, 100 - deductionTotal));
  return { grade: gradeValue, phase: pose.phase.id, principleResults, fixes: [] };
}
