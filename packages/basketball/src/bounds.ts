// Per-phase edit bounds for the pose editor (issue #10, ADR-0009).
//
// ADR-0009 declares the editable state: a declared subset of the model qpos (the 21
// named hinge joints below), the ball pose, and the hand/ball contact encoding; the
// floor plane, the virtual target, and the free root are NOT directly editable (the
// root is derived — the gate projection moves it while the feet stay anchored). The
// ball's orientation is fixed in v1: the ball is a uniform sphere and no principle
// reads its spin state from a static pose (docs/principles-baseline.md excludes
// in-flight spin measurement), so orienting it would edit nothing the scorer sees.
//
// Every editable parameter is bounded per phase so a pose cannot be dragged out of
// its labelled phase (phase is labelled at generation and pinned through editing —
// ADR-0009). Two kinds of bound:
//   - joints:     per-hinge [minDeg, maxDeg] windows (MuJoCo joint convention, the
//                 same sign convention tools/posegen/library.py baselines use);
//   - ball:       a floor-referenced height band for the ball centre plus a tether —
//                 the maximum ball-centre ↔ shooting-hand-centre distance — which is
//                 the editable half of the hand/ball contact encoding (the scored
//                 half, HandBallContact, is derived by the measurement layer, #11).
//
// PROVENANCE — these are ENGINEERING ENVELOPES, not evidence bands (the evidence
// bands live in baseline.ts and are what the scorer grades): each window is the
// shipped pose-library envelope for that phase (tools/posegen generates clean +
// fault-injected poses per phase; faulted poses are in-phase bad form and MUST stay
// editable/fixable) unioned with the form-band region the scorer rewards (so every
// fault is fixable without leaving the phase), padded, then clipped to the model's
// anatomical joint ranges (apps/web/src/spike/scene.xml; the editor re-intersects
// with the live model ranges at runtime as a guard). Joints the library never poses
// (trunk twist/side-bend, hip twist, guide-hand arm) get symmetric style windows —
// wide for the guide-hand arm, whose placement is a graded principle rather than a
// phase marker. apps/web/src/editor tests hold the containment + fixability
// invariants against the shipped library.

import type { PhaseId } from './phases';

/** One hinge joint's per-phase edit window, degrees, MuJoCo joint convention. */
export interface JointBoundsDeg {
  readonly minDeg: number;
  readonly maxDeg: number;
}

/** The per-phase envelope every edit is clamped into (ADR-0009). */
export interface PhaseEditBounds {
  /** Exactly the editable hinge subset (EDITABLE_JOINTS), each with its window. */
  readonly joints: Readonly<Record<string, JointBoundsDeg>>;
  /** Ball-centre height band above the floor, metres. */
  readonly ballHeightM: { readonly min: number; readonly max: number };
  /** Tether: max ball-centre ↔ shooting-hand-centre distance, metres. */
  readonly ballHandMaxM: number;
}

/** The shooting-hand and guide-hand body names in the scene model. */
export const SHOOTING_HAND_BODY = 'hand_right';
export const GUIDE_HAND_BODY = 'hand_left';

/**
 * The declared editable joint subset (ADR-0009): all 21 hinge joints of the scene
 * humanoid, in the pose library's jointOrder. The two free joints (root, ball) are
 * not in this list — the root is derived, the ball is edited as a position.
 */
export const EDITABLE_JOINTS: readonly string[] = [
  'abdomen_z',
  'abdomen_y',
  'abdomen_x',
  'hip_x_right',
  'hip_z_right',
  'hip_y_right',
  'knee_right',
  'ankle_y_right',
  'ankle_x_right',
  'hip_x_left',
  'hip_z_left',
  'hip_y_left',
  'knee_left',
  'ankle_y_left',
  'ankle_x_left',
  'shoulder1_right',
  'shoulder2_right',
  'elbow_right',
  'shoulder1_left',
  'shoulder2_left',
  'elbow_left',
];

/** Shorthand: a symmetric window. */
const w = (minDeg: number, maxDeg: number): JointBoundsDeg => ({ minDeg, maxDeg });

/** Guide-hand arm: full anatomical freedom in every phase — its placement is a
 * graded principle (guide-hand on the ball's side), never a phase marker. */
const GUIDE_ARM = {
  shoulder1_left: w(-85, 60),
  shoulder2_left: w(-85, 60),
  elbow_left: w(-100, 50),
} as const;

/** Trunk twist/side-bend and hip twist: style windows, identical across phases —
 * none of them marks a phase (squaring/rotation is style-variant in the baseline). */
const TRUNK_STYLE = {
  abdomen_z: w(-30, 30),
  abdomen_x: w(-25, 25),
  hip_z_right: w(-25, 25),
  hip_z_left: w(-25, 25),
} as const;

export const PHASE_BOUNDS: Readonly<Record<PhaseId, PhaseEditBounds>> = {
  // 1 · Stance: balanced upright base, ball gathered — knees soft, arms holding
  // the ball at the pocket; heels stay down (ankle windows near neutral).
  stance: {
    joints: {
      ...TRUNK_STYLE,
      abdomen_y: w(-30, 30),
      hip_x_right: w(-30, 8),
      hip_x_left: w(-30, 8),
      hip_y_right: w(-45, 20),
      hip_y_left: w(-45, 20),
      knee_right: w(-45, 0),
      knee_left: w(-45, 0),
      ankle_y_right: w(-20, 15),
      ankle_y_left: w(-20, 15),
      ankle_x_right: w(-15, 15),
      ankle_x_left: w(-15, 15),
      shoulder1_right: w(-85, -40),
      shoulder2_right: w(-60, -15),
      elbow_right: w(-55, -5),
      ...GUIDE_ARM,
    },
    ballHeightM: { min: 1.4, max: 1.72 },
    ballHandMaxM: 0.35,
  },

  // 2 · Dip: the deepest knee/hip load with the ball at its lowest — the knee
  // window reaches the 90–130° 3-point form band (hinge ≈ −90…−50) and still
  // contains the injected straight-knee faults (hinge ≈ −17).
  dip: {
    joints: {
      ...TRUNK_STYLE,
      abdomen_y: w(-5, 30),
      hip_x_right: w(-30, 8),
      hip_x_left: w(-30, 8),
      hip_y_right: w(-70, -20),
      hip_y_left: w(-70, -20),
      knee_right: w(-95, -10),
      knee_left: w(-95, -10),
      ankle_y_right: w(-20, 18),
      ankle_y_left: w(-20, 18),
      ankle_x_right: w(-15, 15),
      ankle_x_left: w(-15, 15),
      shoulder1_right: w(-80, -35),
      shoulder2_right: w(-70, -25),
      elbow_right: w(-15, 45),
      ...GUIDE_ARM,
    },
    ballHeightM: { min: 1.25, max: 1.55 },
    ballHandMaxM: 0.35,
  },

  // 3 · Loading: triple extension drives up while the ball rises to the set
  // point — knees mid-extension, shooting elbow deep under the rising ball.
  loading: {
    joints: {
      ...TRUNK_STYLE,
      abdomen_y: w(-15, 15),
      hip_x_right: w(-30, 8),
      hip_x_left: w(-30, 8),
      hip_y_right: w(-40, 0),
      hip_y_left: w(-40, 0),
      knee_right: w(-65, -15),
      knee_left: w(-65, -15),
      ankle_y_right: w(-15, 20),
      ankle_y_left: w(-15, 20),
      ankle_x_right: w(-15, 15),
      ankle_x_left: w(-15, 15),
      shoulder1_right: w(-85, -20),
      shoulder2_right: w(-45, 45),
      elbow_right: w(-100, -45),
      ...GUIDE_ARM,
    },
    ballHeightM: { min: 1.4, max: 1.95 },
    ballHandMaxM: 0.35,
  },

  // 4 · Set point / Release: legs near extension (knee window reaches the
  // near-full-extension band), arm up with the ball at its highest; heels may
  // rise (wide positive ankle window).
  'set-release': {
    joints: {
      ...TRUNK_STYLE,
      abdomen_y: w(-30, 10),
      hip_x_right: w(-30, 8),
      hip_x_left: w(-30, 8),
      hip_y_right: w(-15, 20),
      hip_y_left: w(-15, 20),
      knee_right: w(-45, 2),
      knee_left: w(-45, 2),
      ankle_y_right: w(-15, 50),
      ankle_y_left: w(-15, 50),
      ankle_x_right: w(-15, 15),
      ankle_x_left: w(-15, 15),
      shoulder1_right: w(-85, -55),
      shoulder2_right: w(25, 60),
      elbow_right: w(-100, -20),
      ...GUIDE_ARM,
    },
    ballHeightM: { min: 1.45, max: 2.0 },
    ballHandMaxM: 0.35,
  },

  // 5 · Follow-through: post-release inertia — arm held toward the target
  // (elbow window reaches full extension), balanced tall landing.
  'follow-through': {
    joints: {
      ...TRUNK_STYLE,
      abdomen_y: w(-30, 10),
      hip_x_right: w(-30, 8),
      hip_x_left: w(-30, 8),
      hip_y_right: w(-15, 20),
      hip_y_left: w(-15, 20),
      knee_right: w(-30, 2),
      knee_left: w(-30, 2),
      ankle_y_right: w(-10, 50),
      ankle_y_left: w(-10, 50),
      ankle_x_right: w(-15, 15),
      ankle_x_left: w(-15, 15),
      shoulder1_right: w(-85, -25),
      shoulder2_right: w(25, 60),
      elbow_right: w(-60, 25),
      ...GUIDE_ARM,
    },
    ballHeightM: { min: 1.35, max: 1.85 },
    ballHandMaxM: 0.35,
  },
};
