// The basketball measurement layer (issue #11): one recipe per measured
// principle, reading docs/principles-baseline.md's "How each principle is
// measured from one pose" off a sport-agnostic PoseSnapshot. The engine
// adapter (apps/web) produces snapshots against the LANDMARK/DIRECTION/CONTACT
// names below; @fix-my-shot/scoring runs the recipes without naming a sport.
//
// Honesty rules carried from the baseline:
//  - a recipe returns `null` when this humanoid cannot read the principle AT
//    ALL (no wrist/finger DOF — wrist-cock, gooseneck; no session history —
//    repeatability): reported unmeasured, never deducted, never a fix;
//  - direction/presence proxies score the SIGN/presence, never a degree;
//  - style-variant recipes exist only to FLAG gross extremes (the scorer
//    never deducts style);
//  - thresholds marked ENGINEERING below are gross-only cutoffs calibrated
//    against the shipped pose library (clean passes, injected faults trip) —
//    they are deliberately generous and are NOT evidence values; evidence
//    bands live in baseline.ts and the doc. None of the doc's dropped numbers
//    ("never resurrect") appear here.

import type { Keypoint, PoseSnapshot } from '@fix-my-shot/core';
import {
  alongM,
  angle3Deg,
  distanceM,
  distanceOutsideConvexPolygon,
  horizontalAngleBetweenDeg,
  horizontalDistanceM,
  lateralOffsetM,
  pointInConvexPolygon,
  signedTiltTowardDeg,
  type RecipeBook,
} from '@fix-my-shot/scoring';

/** Landmark names the engine adapter must supply (world positions, z-up). */
export const LANDMARKS = [
  'torso',
  'head',
  'pelvis',
  'hip_right',
  'knee_right',
  'ankle_right',
  'shoulder_right',
  'elbow_right',
  'hand_right',
  'hip_left',
  'knee_left',
  'ankle_left',
  'shoulder_left',
  'elbow_left',
  'hand_left',
] as const;

/** Direction names the adapter must supply (unit vectors, world frame). */
export const DIRECTIONS = ['torso_forward'] as const;

/** Contact-flag names the adapter must supply. */
export const CONTACTS = ['sole_right', 'sole_left', 'heels_down'] as const;

/** Scene constants (the model's geoms, not evidence values). */
const BALL_R = 0.12;
const HAND_R = 0.04;

// ── ENGINEERING thresholds (gross-only; calibrated vs the shipped library) ──
// Trunk-lean sign note: this humanoid's trunk vector (pelvis→torso) tilts
// BACKWARD when the pose hunches (abdomen flexion swings the pelvis forward
// under the free root), so "forward flexion" = NEGATIVE raw lean; recipes
// flip the sign where the baseline speaks forward-positive.
const GROSS_HUNCH_DEG = 5; // erect-torso: forward flexion beyond this = marked hunch (clean stance ≈ −3…−5, hunched faults ≈ +8…+10 forward)
const EXTREME_TILT_DEG = 8; // trunk-inclination (style flag): |lean| beyond this = extreme (clean ≤ 4.6°, lean-back faults ≥ 12.9°)
const FULLY_SIDEWAYS_DEG = 30; // shoulders-squared (style flag): shoulder line within this of the target line = fully sideways
const FACING_DEG = 60; // head/eyes toward target: horizontal cone half-angle (gentle, direction-only)
const LOAD_ASYM_DEG = 12; // load symmetry: |knee L − R| beyond this = asymmetric load
const LOAD_HIP_STRAIGHT_DEG = 168; // load coherence: hip still straighter than this while knees flex = stiff-knee bow
const DRIVE_KNEE_MIN_DEG = 138; // sequential-leg-extension: between the dip band's top (130°) and the shipped clean drive (151°)
const GATHER_FLARE_MAX_DEG = 45; // elbow-under-loading: gross flare only (clean gather ≈ 6.5°, flare faults ≥ 51.6°)
const ARM_LOW_DEG = 100; // shoulder-elevation (style flag): upper arm within this of straight-down = no arm drive (clean ≈ 132°, low-arm faults ≤ 99°)
const RELEASE_KNEE_MIN_DEG = 158; // base-extended: between the knee-bent faults (≤ 150.5°) and every clean/other release (≥ 163.9°)
const FT_ARM_UP_DEG = 120; // terminal fingerprint: upper arm held up (clean ≈ 133°, dropped-arm faults ≤ 111.6°)
const FT_ELBOW_MIN_DEG = 85; // terminal arm fingerprint: between the collapsed faults (≤ 60.7°) and the shipped clean (110.5°)
const PADS_GAP_MIN_M = -0.005; // pads gap: at most the gate's penetration tolerance…
const PADS_GAP_MAX_M = 0.065; // …and no farther than a contact-plausible reach
const HAND_UNDER_SLACK_M = 0.02; // hand-behind-and-under: hand centre at/below ball centre + slack
const SQUARE_HAND_LATERAL_MAX_M = 0.075; // square-hand: hand within this of the ball→target vertical plane
const GUIDE_TOUCH_M = BALL_R + HAND_R + 0.05; // guide-hand: nearer than this = interacting with the ball
const HEAD_BASE_MARGIN_M = 0.06; // head-stabilized: head may project this far outside the base
const HEAD_FOLD_DEG = 6; // head-stabilized: forward trunk fold throwing the head ahead of the pelvis column (clean ≤ 1.3°, forward-collapse fault ≥ 10.1°)
const SIGHT_OCCLUDE_FRAC = 0.9; // sightline: flag only when the ball blocks ≥ this fraction of its radius

function kp(snapshot: PoseSnapshot, name: string): Keypoint {
  const point = snapshot.keypoints[name];
  if (!point) throw new Error(`snapshot is missing landmark '${name}'`);
  return point;
}

function dir(snapshot: PoseSnapshot, name: string): Keypoint {
  const vector = snapshot.directions[name];
  if (!vector) throw new Error(`snapshot is missing direction '${name}'`);
  return vector;
}

function contact(snapshot: PoseSnapshot, name: string): boolean {
  const flag = snapshot.contacts[name];
  if (flag === undefined) throw new Error(`snapshot is missing contact flag '${name}'`);
  return flag;
}

/** Knee 3-point angle (hip–knee–ankle), one side. 180° = straight. */
function kneeDeg(s: PoseSnapshot, side: 'right' | 'left'): number {
  return angle3Deg(kp(s, `hip_${side}`), kp(s, `knee_${side}`), kp(s, `ankle_${side}`));
}

/** Hip 3-point angle (torso–hip–knee), one side. 180° = straight. */
function hipDeg(s: PoseSnapshot, side: 'right' | 'left'): number {
  return angle3Deg(kp(s, 'torso'), kp(s, `hip_${side}`), kp(s, `knee_${side}`));
}

/** Shooting-elbow 3-point angle (shoulder–elbow–hand). 180° = straight. */
function elbowDeg(s: PoseSnapshot): number {
  return angle3Deg(kp(s, 'shoulder_right'), kp(s, 'elbow_right'), kp(s, 'hand_right'));
}

const avg = (a: number, b: number) => (a + b) / 2;

/** Trunk forward flexion, degrees, forward-positive (see the sign note above:
 * the raw pelvis→torso tilt reads backward-positive on this skeleton). */
function trunkForwardDeg(s: PoseSnapshot): number {
  return -signedTiltTowardDeg(kp(s, 'pelvis'), kp(s, 'torso'), s.targetDirection);
}

/** Head/torso facing: horizontal angle between the forward axis and the target. */
function facingDeg(s: PoseSnapshot): number {
  return horizontalAngleBetweenDeg(dir(s, 'torso_forward'), s.targetDirection);
}

/** Frontal-plane forearm-vs-vertical angle (the elbow-flare reading), degrees. */
function forearmFlareDeg(s: PoseSnapshot): number {
  const elbow = kp(s, 'elbow_right');
  const hand = kp(s, 'hand_right');
  const lateral = lateralOffsetM(hand, elbow, s.targetDirection);
  const vertical = hand[2] - elbow[2];
  return Math.abs((Math.atan2(Math.abs(lateral), Math.max(vertical, 1e-6)) * 180) / Math.PI);
}

/** Angle of the shooting upper arm away from straight-down, degrees
 * (0 = hanging at the side, 180 = straight overhead). */
function upperArmFromDownDeg(s: PoseSnapshot): number {
  const shoulder = kp(s, 'shoulder_right');
  const elbow = kp(s, 'elbow_right');
  const upperArm = [elbow[0] - shoulder[0], elbow[1] - shoulder[1], elbow[2] - shoulder[2]];
  const cos = -upperArm[2]! / Math.max(1e-12, Math.hypot(...upperArm));
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

/**
 * The basketball recipe book: covers every measured (non-qualitative)
 * principle of the baseline. Grouped by phase in baseline order.
 */
export const RECIPES: RecipeBook = {
  // ── 1 · Stance / Preparation ─────────────────────────────────────────────
  'com-inside-base': (s) =>
    pointInConvexPolygon([s.com[0], s.com[1]], s.supportPolygon),

  'both-feet-grounded': (s) =>
    contact(s, 'sole_right') && contact(s, 'sole_left') && contact(s, 'heels_down'),

  'stance-width': (s) =>
    horizontalDistanceM(kp(s, 'ankle_right'), kp(s, 'ankle_left')) / s.stature,

  'erect-torso': (s) => trunkForwardDeg(s) <= GROSS_HUNCH_DEG,

  'trunk-inclination': (s) => Math.abs(trunkForwardDeg(s)) <= EXTREME_TILT_DEG,

  'shoulders-squared': (s) => {
    const right = kp(s, 'shoulder_right');
    const left = kp(s, 'shoulder_left');
    const line: Keypoint = [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
    // Squared ≈ shoulder line perpendicular to the target; flag only when the
    // line has swung nearly parallel to it (fully sideways).
    return horizontalAngleBetweenDeg(line, s.targetDirection) >= FULLY_SIDEWAYS_DEG;
  },

  'head-toward-target': (s) => facingDeg(s) <= FACING_DEG,

  'early-target-acquisition': (s) => facingDeg(s) <= FACING_DEG,

  // ── 2 · Dip / Gather ─────────────────────────────────────────────────────
  'knee-flexion': (s) => avg(kneeDeg(s, 'right'), kneeDeg(s, 'left')),

  'hip-flexion': (s) => avg(hipDeg(s, 'right'), hipDeg(s, 'left')),

  'deep-elbow-flexion': (s) => elbowDeg(s),

  'load-presence': (s) => {
    const kneeRight = kneeDeg(s, 'right');
    const kneeLeft = kneeDeg(s, 'left');
    const knee = avg(kneeRight, kneeLeft);
    const hip = avg(hipDeg(s, 'right'), hipDeg(s, 'left'));
    const loaded = knee <= 155; // the doc's own cutoff: fault only a near-straight knee (>~155°)
    const coherent = !(knee <= 155 - 10 && hip >= LOAD_HIP_STRAIGHT_DEG); // stiff-knee hip-only "bow"
    const symmetric = Math.abs(kneeRight - kneeLeft) <= LOAD_ASYM_DEG;
    return loaded && coherent && symmetric;
  },

  // ── 3 · Loading / Ball-elevation ─────────────────────────────────────────
  'sequential-leg-extension': (s) =>
    avg(kneeDeg(s, 'right'), kneeDeg(s, 'left')) >= DRIVE_KNEE_MIN_DEG,

  'elbow-under-loading': (s) => forearmFlareDeg(s) <= GATHER_FLARE_MAX_DEG,

  'shoulder-elevation': (s) => upperArmFromDownDeg(s) > ARM_LOW_DEG,

  'wrist-cocked': () => null, // no wrist DOF in this humanoid — unmeasurable (model.py)

  'guide-hand': (s) => {
    const hand = kp(s, 'hand_left');
    const ball = s.implement.position;
    const ballK: Keypoint = [ball[0], ball[1], ball[2]];
    const d = distanceM(hand, ballK);
    if (d > GUIDE_TOUCH_M) return true; // not interacting with the ball: nothing to fault
    const p: Keypoint = [hand[0] - ballK[0], hand[1] - ballK[1], hand[2] - ballK[2]];
    const len = Math.max(1e-12, Math.hypot(...p));
    const onTop = p[2] / len > 0.6;
    const under = p[2] / len < -0.6;
    const inFront = alongM(hand, ballK, s.targetDirection) / len > 0.6;
    return !(onTop || under || inFront); // fault only the steering positions
  },

  // ── 4 · Set point / Release ──────────────────────────────────────────────
  'near-full-elbow-extension': (s) => elbowDeg(s),

  'elbow-flare-release': (s) => forearmFlareDeg(s),

  'trunk-at-release': (s) => trunkForwardDeg(s),

  'ball-on-finger-pads': (s) => {
    const gap =
      distanceM(kp(s, 'hand_right'), [
        s.implement.position[0],
        s.implement.position[1],
        s.implement.position[2],
      ]) -
      (BALL_R + HAND_R);
    return gap >= PADS_GAP_MIN_M && gap <= PADS_GAP_MAX_M;
  },

  'hand-behind-under': (s) => {
    const hand = kp(s, 'hand_right');
    const ball: Keypoint = [s.implement.position[0], s.implement.position[1], s.implement.position[2]];
    const behind = alongM(hand, ball, s.targetDirection) <= 0; // hand on the away-from-target side
    const under = hand[2] <= ball[2] + HAND_UNDER_SLACK_M;
    return behind && under;
  },

  'square-hand': (s) => {
    const ball: Keypoint = [s.implement.position[0], s.implement.position[1], s.implement.position[2]];
    return (
      Math.abs(lateralOffsetM(kp(s, 'hand_right'), ball, s.targetDirection)) <=
      SQUARE_HAND_LATERAL_MAX_M
    );
  },

  'wrist-snap-gooseneck': () => null, // no wrist DOF — unmeasurable

  'eyes-on-target': (s) => facingDeg(s) <= FACING_DEG,

  'unobstructed-sightline': (s) => {
    const head = kp(s, 'head');
    const ball: Keypoint = [s.implement.position[0], s.implement.position[1], s.implement.position[2]];
    const along = alongM(ball, head, s.targetDirection);
    if (along <= 0 || along > 1.2) return true; // ball not between eyes and target
    const alongVec: Keypoint = [
      head[0] + s.targetDirection[0] * along,
      head[1] + s.targetDirection[1] * along,
      head[2] + s.targetDirection[2] * along,
    ];
    return distanceM(ball, alongVec) >= BALL_R * SIGHT_OCCLUDE_FRAC; // flag only full occlusion
  },

  'base-extended': (s) =>
    avg(kneeDeg(s, 'right'), kneeDeg(s, 'left')) >= RELEASE_KNEE_MIN_DEG,

  // ── 5 · Follow-through / Inertia ─────────────────────────────────────────
  'terminal-wrist-flexion': (s) => {
    // The wrist itself is unreadable (no DOF); the doc's readable fingerprint
    // components are the ARM: elbow extended, shoulder up — exactly what the
    // fault injector perturbs. Wrist detail stays deferred to a richer hand.
    const elbowExtended = elbowDeg(s) >= FT_ELBOW_MIN_DEG;
    const armUp = upperArmFromDownDeg(s) >= FT_ARM_UP_DEG;
    return elbowExtended && armUp;
  },

  'head-stabilized': (s) => {
    // Two gross-displacement reads: the head's ground projection leaving the
    // base, OR a forward trunk fold throwing the head ahead of the pelvis
    // column. The second is load-bearing on this model: rebalancing re-centres
    // the legs under the head, so a forward collapse keeps the projection
    // inside the base while the fold itself remains the visible residue.
    const overBase =
      distanceOutsideConvexPolygon([kp(s, 'head')[0], kp(s, 'head')[1]], s.supportPolygon) <=
      HEAD_BASE_MARGIN_M;
    return overBase && trunkForwardDeg(s) <= HEAD_FOLD_DEG;
  },

  'repeatable-symmetric-geometry': () => null, // needs cross-session history (issue #13) — a single frame cannot read repeatability
};
