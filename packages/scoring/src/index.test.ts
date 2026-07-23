import { describe, expect, it } from 'vitest';
import type { FormObjective, Phase, Pose } from '@fix-my-shot/core';
import { grade } from './index';

const phase: Phase = { id: 'release', index: 0, label: 'Release' };
const poseIn = (): Pose => ({
  phase,
  jointAngles: {},
  implement: { id: 'x', position: [0, 0, 0] },
});

const objective: FormObjective = {
  principles: [
    {
      id: 'flare',
      phase: 'release',
      tier: 'guideline',
      criterion: { kind: 'band', min: 0, max: 15, unit: 'deg' },
    },
  ],
};

describe('grade', () => {
  it('gives 100 when every applicable principle is in range', () => {
    expect(grade(poseIn(), objective, { flare: 10 }).grade).toBe(100);
  });

  it('deducts for an out-of-range guideline principle', () => {
    const report = grade(poseIn(), objective, { flare: 30 });
    expect(report.grade).toBeLessThan(100);
    expect(report.principleResults.find((r) => !r.satisfied)).toBeDefined();
  });

  it('caps the grade on a written-in-stone violation', () => {
    const objectiveStone: FormObjective = {
      principles: [
        {
          id: 'elbow',
          phase: 'release',
          tier: 'written-in-stone',
          criterion: { kind: 'band', min: 150, max: 175, unit: 'deg' },
        },
      ],
    };
    expect(grade(poseIn(), objectiveStone, { elbow: 120 }).grade).toBeLessThan(100);
  });

  it('ignores principles from other phases', () => {
    const other: FormObjective = {
      principles: [
        {
          id: 'knee',
          phase: 'dip',
          tier: 'guideline',
          criterion: { kind: 'band', min: 90, max: 130, unit: 'deg' },
        },
      ],
    };
    // 'knee' is a dip principle; grading a release pose must not require its measurement.
    expect(grade(poseIn(), other, {}).grade).toBe(100);
  });

  it('throws when an applicable measurement is missing (negative path)', () => {
    expect(() => grade(poseIn(), objective, {})).toThrow(/no measurement/);
  });
});
