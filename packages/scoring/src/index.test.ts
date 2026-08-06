import { describe, expect, it } from 'vitest';
import type { FormObjective, Phase, Pose, PoseSnapshot } from '@fix-my-shot/core';
import {
  GUIDELINE_CAP,
  PROXY_DEDUCTION,
  STONE_CAP_FLOOR,
  STONE_CAP_RANGE,
  grade,
  measureAll,
} from './index';

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

describe('ADR-0008 aggregation semantics (issue #11)', () => {
  const stoneBand: FormObjective = {
    principles: [
      {
        id: 'elbow',
        phase: 'release',
        tier: 'written-in-stone',
        criterion: { kind: 'band', min: 150, max: 175, unit: 'deg' },
      },
    ],
  };

  it('the stone cap falls monotonically with violation depth and stays in [floor, floor+range]', () => {
    const shallow = grade(poseIn(), stoneBand, { elbow: 149 }).grade;
    const deep = grade(poseIn(), stoneBand, { elbow: 100 }).grade;
    const absurd = grade(poseIn(), stoneBand, { elbow: 10 }).grade;
    expect(shallow).toBeLessThanOrEqual(STONE_CAP_FLOOR + STONE_CAP_RANGE);
    expect(deep).toBeLessThan(shallow);
    expect(absurd).toBeLessThan(deep);
    expect(absurd).toBeGreaterThanOrEqual(STONE_CAP_FLOOR);
  });

  it('a broken stone cannot be buried under clean guidelines (structural dominance)', () => {
    const mixed: FormObjective = {
      principles: [
        ...stoneBand.principles,
        {
          id: 'g1',
          phase: 'release',
          tier: 'guideline',
          criterion: { kind: 'presence' },
        },
      ],
    };
    const report = grade(poseIn(), mixed, { elbow: 120, g1: true });
    expect(report.grade).toBeLessThanOrEqual(STONE_CAP_FLOOR + STONE_CAP_RANGE);
  });

  it('guideline band deductions are band-width-normalized, monotone, and never flat-line', () => {
    const wide: FormObjective = {
      principles: [
        {
          id: 'w',
          phase: 'release',
          tier: 'guideline',
          criterion: { kind: 'band', min: 0, max: 40, unit: 'deg' },
        },
      ],
    };
    const tight: FormObjective = {
      principles: [
        {
          id: 'w',
          phase: 'release',
          tier: 'guideline',
          criterion: { kind: 'band', min: 0, max: 10, unit: 'deg' },
        },
      ],
    };
    // Same absolute overshoot: the tight band bites harder.
    expect(grade(poseIn(), tight, { w: 20 }).grade).toBeLessThan(
      grade(poseIn(), wide, { w: 50 }).grade,
    );
    // Monotone with a live gradient even deep out of band (leverage needs it).
    const d1 = grade(poseIn(), wide, { w: 80 }).grade;
    const d2 = grade(poseIn(), wide, { w: 120 }).grade;
    const d3 = grade(poseIn(), wide, { w: 160 }).grade;
    expect(d2).toBeLessThan(d1);
    expect(d3).toBeLessThan(d2);
    // Asymptote: never below 100 − GUIDELINE_CAP for a single band principle.
    expect(d3).toBeGreaterThan(100 - GUIDELINE_CAP);
  });

  it('a failed style-variant is FLAGGED, never deducted (SPEC acceptance #3)', () => {
    const style: FormObjective = {
      principles: [
        { id: 's', phase: 'release', tier: 'style-variant', criterion: { kind: 'presence' } },
      ],
    };
    const report = grade(poseIn(), style, { s: false });
    expect(report.grade).toBe(100);
    const result = report.principleResults[0]!;
    expect(result.satisfied).toBe(false);
    expect(result.deduction).toBe(0);
  });

  it('a null measurement reads as unmeasured: reported, never deducted', () => {
    const report = grade(poseIn(), objective, { flare: null });
    expect(report.grade).toBe(100);
    const result = report.principleResults[0]!;
    expect(result.measured).toBe(false);
    expect(result.satisfied).toBe(true);
    expect(result.deduction).toBe(0);
  });

  it('a failed guideline proxy deducts the flat proxy weight', () => {
    const proxy: FormObjective = {
      principles: [
        { id: 'p', phase: 'release', tier: 'guideline', criterion: { kind: 'presence' } },
      ],
    };
    expect(grade(poseIn(), proxy, { p: false }).grade).toBe(100 - PROXY_DEDUCTION);
  });

  it('grading is deterministic', () => {
    const a = grade(poseIn(), objective, { flare: 30 });
    const b = grade(poseIn(), objective, { flare: 30 });
    expect(a).toEqual(b);
  });
});

describe('measureAll', () => {
  const snapshot = (phase: string): PoseSnapshot => ({
    phase,
    keypoints: {},
    directions: {},
    com: [0, 0, 1],
    supportPolygon: [],
    contacts: {},
    implement: { id: 'x', position: [0, 0, 0] },
    stature: 1.5,
    targetDirection: [1, 0, 0],
  });

  const mixedObjective: FormObjective = {
    principles: [
      { id: 'b', phase: 'release', tier: 'guideline', criterion: { kind: 'band', min: 0, max: 1, unit: 'x' } },
      { id: 'q', phase: 'release', tier: 'guideline', criterion: { kind: 'qualitative' } },
      { id: 'other', phase: 'dip', tier: 'guideline', criterion: { kind: 'presence' } },
    ],
  };

  it('runs recipes for phase-appropriate measurable principles only', () => {
    const calls: string[] = [];
    const measurements = measureAll(snapshot('release'), mixedObjective, {
      b: () => {
        calls.push('b');
        return 0.5;
      },
      other: () => {
        calls.push('other');
        return true;
      },
    });
    expect(calls).toEqual(['b']); // qualitative skipped, other-phase skipped
    expect(measurements).toEqual({ b: 0.5 });
  });

  it('passes null (unmeasurable) through', () => {
    expect(measureAll(snapshot('release'), mixedObjective, { b: () => null })).toEqual({
      b: null,
    });
  });

  it('throws on a missing recipe for a measurable principle', () => {
    expect(() => measureAll(snapshot('release'), mixedObjective, {})).toThrow(/no recipe/);
  });
});
