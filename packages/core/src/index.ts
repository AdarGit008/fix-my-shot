// @fix-my-shot/core — the sport-agnostic form-analysis domain.
//
// This package names NO sport-specific concept (ADR-0006): the handled object is an
// abstract "implement", phases are abstract (id + order), and no sport vocabulary
// appears anywhere in this tree. The boundary is enforced two ways — a lint rule
// (eslint.config.js) blocks imports of any per-sport plugin, and test/core-seam.test.ts
// (TEST-03) fails red if a sport term ever lands here. Concrete phase labels and
// principle data are supplied by the per-sport plugins.

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
}

/** One labelled stage of a movement. The concrete label set is supplied per sport. */
export interface Phase {
  readonly id: string;
  /** Ordering within the movement, 0-based. */
  readonly index: number;
}

/** A body + implement configuration at one instant, tagged with the phase it belongs to. */
export interface Pose {
  readonly phase: Phase;
  readonly jointAngles: Readonly<Record<JointId, number>>;
  readonly implement: Implement;
}

/**
 * A measurable form principle expressed as an accepted range (ADR-0004 / ADR-0008).
 * A value inside the range is style and is never penalised; outside is a conflict.
 */
export interface PrincipleRange {
  readonly id: string;
  /** The phase id this principle is measured in. */
  readonly phase: string;
  readonly min: number;
  readonly max: number;
  /** Unit label for the measured quantity (e.g. "deg"). */
  readonly unit: string;
}

/** What a scorer grades against: a set of principles for a form. */
export interface FormObjective {
  readonly principles: readonly PrincipleRange[];
}

/**
 * True when a measured value falls inside a principle's accepted range.
 * @throws {TypeError} when `value` is not a finite number.
 */
export function inRange(principle: PrincipleRange, value: number): boolean {
  if (!Number.isFinite(value)) {
    throw new TypeError(`value must be a finite number, got ${String(value)}`);
  }
  return value >= principle.min && value <= principle.max;
}
