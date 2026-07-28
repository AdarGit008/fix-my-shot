import { describe, expect, it } from 'vitest';
import { BASELINE, PHASES } from '@fix-my-shot/basketball';
import { POSE_LIBRARY, toCorePose } from './index';

const phaseIds = new Set(PHASES.map((p) => p.id));
const principleIds = new Set(BASELINE.map((p) => p.id));

describe('offline pose library', () => {
  it('is a versioned, seeded library of dozens of poses', () => {
    expect(POSE_LIBRARY.version).toBe(1);
    expect(POSE_LIBRARY.seed).toBeGreaterThan(0);
    expect(POSE_LIBRARY.poses).toHaveLength(POSE_LIBRARY.poseCount);
    expect(POSE_LIBRARY.poses.length).toBeGreaterThanOrEqual(24);
  });

  it('covers all five phases with both clean and faulted poses', () => {
    expect(new Set(POSE_LIBRARY.poses.map((p) => p.phase))).toEqual(phaseIds);
    expect(POSE_LIBRARY.poses.some((p) => p.kind === 'clean')).toBe(true);
    expect(POSE_LIBRARY.poses.some((p) => p.kind === 'faulted')).toBe(true);
  });

  it('every pose is gate-valid and phase-labeled', () => {
    for (const p of POSE_LIBRARY.poses) {
      expect(p.valid, p.id).toBe(true);
      expect(p.gate.valid, p.id).toBe(true);
      expect(phaseIds.has(p.phase), p.id).toBe(true);
    }
  });

  it('clean poses carry no fault; faulted poses reference real baseline principles', () => {
    for (const p of POSE_LIBRARY.poses) {
      if (p.kind === 'clean') {
        expect(p.faults, p.id).toHaveLength(0);
      } else {
        expect(p.faults.length, p.id).toBeGreaterThan(0);
        for (const fault of p.faults) {
          expect(principleIds.has(fault.principle), `${p.id}: ${fault.principle}`).toBe(true);
        }
      }
    }
  });

  it('converts to a core Pose across the package seam', () => {
    const first = POSE_LIBRARY.poses[0];
    if (!first) throw new Error('pose library is empty');
    const pose = toCorePose(first);
    expect(pose.phase.id).toBe(first.phase);
    expect(Object.keys(pose.jointAngles)).toHaveLength(POSE_LIBRARY.jointOrder.length);
    expect(pose.implement.id).toBe('ball');
    expect(pose.implement.position).toHaveLength(3);
  });
});
