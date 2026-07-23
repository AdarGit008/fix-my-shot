// Scene specifics for basketball (ADR-0009): the fixed virtual target and the contact
// encodings the scorer reads. Sport vocabulary (rim, free-throw, ball) is legitimate here —
// it is exactly what @fix-my-shot/core is forbidden to name.

import type { Implement } from '@fix-my-shot/core';

/**
 * The fixed virtual target (ADR-0009): a direction the body orients to plus a nominal
 * free-throw geometry. Direction only — no ball flight is computed, nothing travels to it.
 */
export interface TargetGeometry {
  /** Target azimuth in degrees (0 = straight ahead of the stance). */
  readonly azimuthDeg: number;
  /** Nominal rim height in metres. */
  readonly rimHeightM: number;
  /** Nominal distance from the stance to the rim, in metres. */
  readonly distanceAheadM: number;
}

/** The nominal free-throw target: rim 3.05 m high, 4.57 m ahead of the stance (ADR-0009). */
export const FREE_THROW_TARGET: TargetGeometry = {
  azimuthDeg: 0,
  rimHeightM: 3.05,
  distanceAheadM: 4.57,
};

/** The shot implement — a regulation men's basketball (contact/inertia specifics). */
export interface BallSpec extends Implement {
  readonly radiusM: number;
  readonly massKg: number;
}

export const BALL: BallSpec = {
  id: 'ball',
  position: [0, 0, 0],
  radiusM: 0.1206,
  massKg: 0.623,
};

/** Foot–floor contact (ADR-0009): which soles touch, and whether the heels are lifted. */
export interface FootContact {
  readonly leftGrounded: boolean;
  readonly rightGrounded: boolean;
  readonly heelsLifted: boolean;
}

/**
 * Shooting-hand ↔ ball contact encoding (ADR-0009 / the produced-backspin geometry proxy):
 * pads-not-palm with a clearance gap, hand behind-and-under, and the lateral twist about
 * the vertical target plane (~0 when aligned).
 */
export interface HandBallContact {
  readonly padsNotPalm: boolean;
  readonly behindAndUnder: boolean;
  readonly lateralTwistDeg: number;
}
