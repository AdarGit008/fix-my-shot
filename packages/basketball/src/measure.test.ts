import { describe, expect, it } from 'vitest';
import type { PoseSnapshot } from '@fix-my-shot/core';
import { RECIPES } from './measure';

// Hand-built snapshots per phase (issue #11): a plausible upright body with the
// ball at the shooting hand, then each test perturbs exactly the geometry its
// recipe reads. Coordinates are metres, z-up, target = +x.

type Mutable = {
  -readonly [K in keyof PoseSnapshot]: PoseSnapshot[K] extends Readonly<Record<string, infer V>>
    ? Record<string, V>
    : PoseSnapshot[K];
};

function base(phase: string): Mutable {
  const keypoints: Record<string, readonly [number, number, number]> = {
    torso: [0, 0, 1.28],
    head: [0, 0, 1.47],
    pelvis: [-0.01, 0, 0.86],
    hip_right: [-0.01, -0.1, 0.82],
    knee_right: [0, -0.09, 0.42],
    ankle_right: [0, -0.09, 0.03],
    hip_left: [-0.01, 0.1, 0.82],
    knee_left: [0, 0.09, 0.42],
    ankle_left: [0, 0.09, 0.03],
    shoulder_right: [0, -0.17, 1.34],
    elbow_right: [0.18, -0.35, 1.16],
    hand_right: [0.36, -0.17, 1.34],
    shoulder_left: [0, 0.17, 1.34],
    elbow_left: [0.02, 0.36, 1.0],
    hand_left: [0.04, 0.38, 0.64],
  };
  return {
    phase,
    keypoints,
    directions: { torso_forward: [1, 0, 0] },
    com: [0, 0, 0.9],
    supportPolygon: [
      [-0.1, -0.15],
      [0.16, -0.15],
      [0.16, 0.15],
      [-0.1, 0.15],
    ],
    contacts: { sole_right: true, sole_left: true, heels_down: true },
    implement: { id: 'ball', position: [0.5, -0.17, 1.4] },
    stature: 1.56,
    targetDirection: [1, 0, 0],
  };
}

const run = (id: string, s: Mutable) => {
  const recipe = RECIPES[id];
  if (!recipe) throw new Error(`no recipe '${id}'`);
  return recipe(s as PoseSnapshot);
};

describe('stance recipes', () => {
  it('com-inside-base reads the support polygon', () => {
    const s = base('stance');
    expect(run('com-inside-base', s)).toBe(true);
    s.com = [0.5, 0, 0.9];
    expect(run('com-inside-base', s)).toBe(false);
  });

  it('both-feet-grounded needs both soles and the heels', () => {
    const s = base('stance');
    expect(run('both-feet-grounded', s)).toBe(true);
    s.contacts = { ...s.contacts, heels_down: false };
    expect(run('both-feet-grounded', s)).toBe(false);
    s.contacts = { sole_right: true, sole_left: false, heels_down: true };
    expect(run('both-feet-grounded', s)).toBe(false);
  });

  it('stance-width is inter-ankle distance ÷ stature', () => {
    const s = base('stance');
    expect(run('stance-width', s)).toBeCloseTo(0.18 / 1.56, 5);
  });

  it('erect-torso faults only a marked forward hunch', () => {
    const s = base('stance');
    expect(run('erect-torso', s)).toBe(true);
    // Hunch on this skeleton: the pelvis swings toward the target under the
    // torso (forward flexion) — move the pelvis +x.
    s.keypoints = { ...s.keypoints, pelvis: [0.12, 0, 0.85] };
    expect(run('erect-torso', s)).toBe(false);
  });

  it('trunk-inclination flags extremes in either direction', () => {
    const s = base('stance');
    expect(run('trunk-inclination', s)).toBe(true);
    s.keypoints = { ...s.keypoints, pelvis: [-0.15, 0, 0.85] }; // marked backward lean
    expect(run('trunk-inclination', s)).toBe(false);
  });

  it('shoulders-squared flags only fully sideways', () => {
    const s = base('stance');
    expect(run('shoulders-squared', s)).toBe(true); // shoulder line ⊥ target
    s.keypoints = {
      ...s.keypoints,
      shoulder_right: [-0.17, -0.02, 1.34],
      shoulder_left: [0.17, 0.02, 1.34],
    }; // line nearly parallel to the target direction
    expect(run('shoulders-squared', s)).toBe(false);
  });

  it('head-toward-target is a gentle direction-only cone', () => {
    const s = base('stance');
    expect(run('head-toward-target', s)).toBe(true);
    s.directions = { torso_forward: [-1, 0.1, 0] }; // facing away
    expect(run('head-toward-target', s)).toBe(false);
  });
});

describe('dip recipes', () => {
  it('knee-flexion and hip-flexion are side-averaged 3-point angles', () => {
    const s = base('dip');
    // Straight-ish legs in the base pose: near 180.
    expect(run('knee-flexion', s)).toBeGreaterThan(160);
    // Fold the knees forward: angle drops.
    s.keypoints = {
      ...s.keypoints,
      knee_right: [0.3, -0.09, 0.5],
      knee_left: [0.3, 0.09, 0.5],
    };
    expect(run('knee-flexion', s)).toBeLessThan(120);
    expect(run('hip-flexion', s)).toBeLessThan(160);
  });

  it('load-presence faults a near-straight knee, incoherent hips, or asymmetry', () => {
    const s = base('dip');
    // Base pose: knees near-straight → unloaded.
    expect(run('load-presence', s)).toBe(false);
    // A symmetric proper load passes.
    s.keypoints = {
      ...s.keypoints,
      knee_right: [0.25, -0.09, 0.48],
      knee_left: [0.25, 0.09, 0.48],
    };
    expect(run('load-presence', s)).toBe(true);
    // Asymmetric load fails.
    s.keypoints = { ...s.keypoints, knee_left: [0.05, 0.09, 0.44] };
    expect(run('load-presence', s)).toBe(false);
  });
});

describe('loading recipes', () => {
  it('sequential-leg-extension needs the knees extending', () => {
    const s = base('loading');
    expect(run('sequential-leg-extension', s)).toBe(true); // near-straight base legs
    s.keypoints = {
      ...s.keypoints,
      knee_right: [0.3, -0.09, 0.5],
      knee_left: [0.3, 0.09, 0.5],
    };
    expect(run('sequential-leg-extension', s)).toBe(false);
  });

  it('wrist-cocked is honestly unmeasurable on this model', () => {
    expect(run('wrist-cocked', base('loading'))).toBeNull();
  });

  it('guide-hand passes when clear of the ball and faults steering positions', () => {
    const s = base('loading');
    expect(run('guide-hand', s)).toBe(true); // hanging left hand, not touching
    s.keypoints = { ...s.keypoints, hand_left: [0.5, -0.17, 1.56] }; // on TOP of the ball
    expect(run('guide-hand', s)).toBe(false);
    s.keypoints = { ...s.keypoints, hand_left: [0.5, -0.32, 1.4] }; // on the side
    expect(run('guide-hand', s)).toBe(true);
  });
});

describe('set-release recipes', () => {
  it('near-full-elbow-extension is the shoulder–elbow–hand angle', () => {
    const s = base('set-release');
    s.keypoints = {
      ...s.keypoints,
      shoulder_right: [0, -0.17, 1.34],
      elbow_right: [0.1, -0.17, 1.6],
      hand_right: [0.18, -0.17, 1.88],
    };
    expect(run('near-full-elbow-extension', s) as number).toBeGreaterThan(165);
    s.keypoints = { ...s.keypoints, hand_right: [0.35, -0.17, 1.62] }; // folded forward
    expect(run('near-full-elbow-extension', s) as number).toBeLessThan(120);
  });

  it('ball-on-finger-pads wants a contact-plausible gap', () => {
    const s = base('set-release');
    s.keypoints = { ...s.keypoints, hand_right: [0.36, -0.17, 1.34] };
    s.implement = { id: 'ball', position: [0.5, -0.17, 1.44] }; // ~0.17 m: gap ~1 cm
    expect(run('ball-on-finger-pads', s)).toBe(true);
    s.implement = { id: 'ball', position: [0.75, -0.17, 1.6] }; // far: no contact
    expect(run('ball-on-finger-pads', s)).toBe(false);
  });

  it('hand-behind-under wants the hand on the away side and not above the ball', () => {
    const s = base('set-release');
    s.keypoints = { ...s.keypoints, hand_right: [0.36, -0.17, 1.3] };
    s.implement = { id: 'ball', position: [0.5, -0.17, 1.4] };
    expect(run('hand-behind-under', s)).toBe(true);
    s.keypoints = { ...s.keypoints, hand_right: [0.66, -0.17, 1.3] }; // in front of the ball
    expect(run('hand-behind-under', s)).toBe(false);
    s.keypoints = { ...s.keypoints, hand_right: [0.36, -0.17, 1.58] }; // on top
    expect(run('hand-behind-under', s)).toBe(false);
  });

  it('square-hand wants the hand near the ball→target vertical plane', () => {
    const s = base('set-release');
    s.implement = { id: 'ball', position: [0.5, -0.17, 1.4] };
    s.keypoints = { ...s.keypoints, hand_right: [0.36, -0.2, 1.3] };
    expect(run('square-hand', s)).toBe(true);
    s.keypoints = { ...s.keypoints, hand_right: [0.36, -0.35, 1.3] }; // beside the ball
    expect(run('square-hand', s)).toBe(false);
  });

  it('unobstructed-sightline flags only a ball parked on the eye→target line', () => {
    const s = base('set-release');
    s.implement = { id: 'ball', position: [0.5, -0.17, 1.4] }; // beside the sightline
    expect(run('unobstructed-sightline', s)).toBe(true);
    s.implement = { id: 'ball', position: [0.5, 0, 1.47] }; // dead ahead of the eyes
    expect(run('unobstructed-sightline', s)).toBe(false);
  });

  it('wrist-snap-gooseneck is honestly unmeasurable on this model', () => {
    expect(run('wrist-snap-gooseneck', base('set-release'))).toBeNull();
  });
});

describe('follow-through recipes', () => {
  it('terminal-wrist-flexion reads the arm fingerprint: elbow extended AND arm up', () => {
    const s = base('follow-through');
    // Arm up + extended.
    s.keypoints = {
      ...s.keypoints,
      shoulder_right: [0, -0.17, 1.34],
      elbow_right: [0.14, -0.17, 1.6],
      hand_right: [0.26, -0.17, 1.84],
    };
    expect(run('terminal-wrist-flexion', s)).toBe(true);
    // Collapsed elbow.
    s.keypoints = { ...s.keypoints, hand_right: [0.02, -0.17, 1.42] };
    expect(run('terminal-wrist-flexion', s)).toBe(false);
    // Dropped arm (elbow below shoulder level, hanging forward-down).
    s.keypoints = {
      ...s.keypoints,
      elbow_right: [0.2, -0.17, 1.18],
      hand_right: [0.42, -0.17, 1.02],
    };
    expect(run('terminal-wrist-flexion', s)).toBe(false);
  });

  it('head-stabilized faults a forward trunk fold even when rebalanced over the base', () => {
    const s = base('follow-through');
    expect(run('head-stabilized', s)).toBe(true);
    s.keypoints = { ...s.keypoints, pelvis: [0.14, 0, 0.85] }; // fold: pelvis forward under torso
    expect(run('head-stabilized', s)).toBe(false);
  });

  it('repeatable-symmetric-geometry needs history: unmeasurable from one frame', () => {
    expect(run('repeatable-symmetric-geometry', base('follow-through'))).toBeNull();
  });
});
