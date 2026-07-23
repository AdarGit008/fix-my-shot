// @fix-my-shot/core — the sport-agnostic form-analysis domain.
//
// This package names NO sport-specific concept (ADR-0006): the handled object is an
// abstract "implement", phases carry an opaque id + a label supplied per sport, and no
// sport vocabulary appears anywhere in this tree. The boundary is enforced two ways — a
// lint rule (eslint.config.js) blocks imports of any per-sport plugin, and
// test/core-seam.test.ts (TEST-03) fails red if a sport term ever lands here. Concrete
// phase labels, principle data, and target geometry are supplied by the per-sport plugins.

// ---------------------------------------------------------------------------
// Body + implement model
// ---------------------------------------------------------------------------

/** A named articulation in a body model (e.g. "elbow_r"). */
export type JointId = string;

/** A body model: the set of articulations a pose assigns angles to. */
export interface Skeleton {
  readonly joints: readonly JointId[];
}

/** The handled object a form manipulates — sport-neutral by design. */
export interface Implement {
  readonly id: string;
  /** World-space position in metres, [x, y, z]. */
  readonly position: readonly [number, number, number];
  /** Optional world-space orientation as a quaternion [x, y, z, w] (ADR-0009 editable state). */
  readonly orientation?: readonly [number, number, number, number];
}

/**
 * One labelled stage of a movement. Ids and labels are supplied per sport; `index` fixes
 * the order. `parent` optionally groups the stage under a coarser reference-model phase.
 */
export interface Phase {
  readonly id: string;
  /** Ordering within the movement, 0-based. */
  readonly index: number;
  /** Human-readable label supplied by the sport plugin. */
  readonly label: string;
  /** Optional coarser-model grouping this stage nests under. */
  readonly parent?: string;
}

/** A body + implement configuration at one instant, tagged with the phase it belongs to. */
export interface Pose {
  readonly phase: Phase;
  readonly jointAngles: Readonly<Record<JointId, number>>;
  readonly implement: Implement;
}

// ---------------------------------------------------------------------------
// Principles: tier + acceptance criterion
// ---------------------------------------------------------------------------

/**
 * A principle's weight class (ADR-0008 aggregation): `written-in-stone` violations cap the
 * grade (the ceiling falls with violation depth), `guideline` violations subtract
 * band-width-normalized deductions, and `style-variant` — like any in-range value — is
 * never deducted.
 */
export type PrincipleTier = 'written-in-stone' | 'guideline' | 'style-variant';

/**
 * How a principle is checked against a pose. The baseline expresses most principles as
 * numeric ranges (`band`), but several are read as a binary `presence`, a sign-only
 * `direction`, left/right `symmetry`, or an unscored `qualitative` note (ADR-0004 / ADR-0008).
 */
export type Criterion =
  | { readonly kind: 'band'; readonly min: number; readonly max: number; readonly unit: string }
  | { readonly kind: 'presence' }
  | { readonly kind: 'direction' }
  | { readonly kind: 'symmetry' }
  | { readonly kind: 'qualitative' };

/** The numeric acceptance band — the `band` criterion payload. */
export type Band = Extract<Criterion, { kind: 'band' }>;

/**
 * A measurable form principle: which phase it applies in, its tier, and the criterion a
 * scorer checks. Sport plugins supply the concrete set as a FormObjective; the criterion
 * generalises ADR-0004's "expressed as ranges" to the non-numeric readings the baseline
 * actually uses.
 */
export interface Principle {
  readonly id: string;
  /** The phase id this principle is measured in. */
  readonly phase: string;
  readonly tier: PrincipleTier;
  readonly criterion: Criterion;
}

/** What a scorer grades against: the set of principles for a form. */
export interface FormObjective {
  readonly principles: readonly Principle[];
}

/**
 * True when a measured value falls inside a band. In-range is style (never penalised);
 * outside is a conflict (ADR-0004 / ADR-0008).
 * @throws {TypeError} when `value` is not a finite number.
 */
export function inRange(band: Pick<Band, 'min' | 'max'>, value: number): boolean {
  if (!Number.isFinite(value)) {
    throw new TypeError(`value must be a finite number, got ${String(value)}`);
  }
  return value >= band.min && value <= band.max;
}

// ---------------------------------------------------------------------------
// Results + report (produced by the scorer — ADR-0008 / ADR-0009)
// ---------------------------------------------------------------------------

/** One principle's outcome in a graded report: its tier, criterion, membership, and deduction. */
export interface PrincipleResult {
  readonly principleId: string;
  readonly tier: PrincipleTier;
  readonly criterion: Criterion;
  /** Whether the reading satisfied the criterion (in-range / present / correct direction). */
  readonly satisfied: boolean;
  /** Points this principle subtracted from the grade (0 when satisfied or style-variant). */
  readonly deduction: number;
}

/**
 * One ranked fix in a report. Fixes are grouped into coach-meaningful clusters and phrased
 * with external focus (target / implement / arc), never internal body-part commands
 * (ADR-0008 / ADR-0009). `leverage` is the finite-difference sensitivity used to rank.
 */
export interface RankedFix {
  readonly principleId: string;
  readonly cluster: string;
  readonly cue: string;
  readonly leverage: number;
}

/**
 * The structured result of grading one pose. ADR-0009 fixes the contents + invariants
 * (the scorer build fills the JSON schema); `grade` is a 0–100 form grade, NOT a
 * probability (ADR-0008).
 */
export interface Report {
  readonly grade: number;
  /** The pose's labelled phase id. */
  readonly phase: string;
  readonly principleResults: readonly PrincipleResult[];
  /** Every fix, ranked by leverage (top first). */
  readonly fixes: readonly RankedFix[];
}
