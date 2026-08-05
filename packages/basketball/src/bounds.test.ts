import { describe, expect, it } from 'vitest';
import { EDITABLE_JOINTS, PHASE_BOUNDS } from './bounds';
import { PHASES } from './phases';

// Structural invariants of the per-phase edit bounds (issue #10, ADR-0009). The
// physical invariants — every shipped library pose inside its phase's bounds, and
// bounds inside the model's anatomical joint ranges — live in apps/web/src/editor,
// where the pose library and the MuJoCo model are available.

// Anatomical joint ranges transcribed from apps/web/src/spike/scene.xml (degrees).
// Kept in lockstep with the model; the apps/web bounds test re-derives them from the
// compiled model, so drift between this table and the XML fails there, loudly.
const ANATOMICAL: Readonly<Record<string, readonly [number, number]>> = {
  abdomen_z: [-45, 45],
  abdomen_y: [-75, 30],
  abdomen_x: [-35, 35],
  hip_x_right: [-30, 10],
  hip_z_right: [-60, 35],
  hip_y_right: [-150, 20],
  knee_right: [-160, 2],
  ankle_y_right: [-50, 50],
  ankle_x_right: [-50, 50],
  hip_x_left: [-30, 10],
  hip_z_left: [-60, 35],
  hip_y_left: [-150, 20],
  knee_left: [-160, 2],
  ankle_y_left: [-50, 50],
  ankle_x_left: [-50, 50],
  shoulder1_right: [-85, 60],
  shoulder2_right: [-85, 60],
  elbow_right: [-100, 50],
  shoulder1_left: [-85, 60],
  shoulder2_left: [-85, 60],
  elbow_left: [-100, 50],
};

const phaseIds = PHASES.map((p) => p.id);

describe('PHASE_BOUNDS (ADR-0009 per-phase edit bounds)', () => {
  it('covers every phase, and only the five phases', () => {
    expect(Object.keys(PHASE_BOUNDS).sort()).toEqual([...phaseIds].sort());
  });

  it.each(phaseIds)('%s bounds cover exactly the declared editable joints', (phase) => {
    const bounds = PHASE_BOUNDS[phase as keyof typeof PHASE_BOUNDS];
    expect(Object.keys(bounds.joints).sort()).toEqual([...EDITABLE_JOINTS].sort());
  });

  it.each(phaseIds)('%s joint windows are non-empty and inside anatomical ranges', (phase) => {
    const bounds = PHASE_BOUNDS[phase as keyof typeof PHASE_BOUNDS];
    for (const [joint, { minDeg, maxDeg }] of Object.entries(bounds.joints)) {
      expect(minDeg, `${phase}/${joint} window empty`).toBeLessThan(maxDeg);
      const anatomical = ANATOMICAL[joint];
      expect(anatomical, `${phase}/${joint} has no anatomical range`).toBeDefined();
      expect(minDeg, `${phase}/${joint} below anatomical`).toBeGreaterThanOrEqual(anatomical![0]);
      expect(maxDeg, `${phase}/${joint} above anatomical`).toBeLessThanOrEqual(anatomical![1]);
    }
  });

  it.each(phaseIds)('%s ball bounds are sane', (phase) => {
    const bounds = PHASE_BOUNDS[phase as keyof typeof PHASE_BOUNDS];
    expect(bounds.ballHeightM.min).toBeGreaterThan(0.12); // above a resting ball radius
    expect(bounds.ballHeightM.min).toBeLessThan(bounds.ballHeightM.max);
    expect(bounds.ballHandMaxM).toBeGreaterThan(0.12 + 0.04); // beyond touching spheres
  });

  it('the deepest load belongs to the dip (phase-distinguishing knee windows)', () => {
    // The dip is the deepest-flexion phase by definition (baseline taxonomy); its
    // knee window must reach deeper than the release-side phases so the envelope
    // actually separates a gathered load from an extended release.
    const deepest = (phase: keyof typeof PHASE_BOUNDS) =>
      PHASE_BOUNDS[phase].joints['knee_right']!.minDeg;
    expect(deepest('dip')).toBeLessThan(deepest('set-release'));
    expect(deepest('dip')).toBeLessThan(deepest('follow-through'));
  });

  it('ball bands order the phases the taxonomy describes (dip lowest, set/release highest)', () => {
    const band = (phase: keyof typeof PHASE_BOUNDS) => PHASE_BOUNDS[phase].ballHeightM;
    expect(band('dip').max).toBeLessThan(band('set-release').min + 0.11); // dip is the low gather
    expect(band('set-release').max).toBeGreaterThanOrEqual(band('stance').max);
    expect(band('dip').min).toBeLessThan(band('stance').min);
  });
});
