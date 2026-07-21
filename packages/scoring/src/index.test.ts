import { describe, expect, it } from 'vitest';
import type { FormObjective } from '@fix-my-shot/core';
import { grade } from './index';

const objective: FormObjective = {
  principles: [{ id: 'elbow-flare', phase: 'set-release', min: 0, max: 15, unit: 'deg' }],
};

describe('grade', () => {
  it('gives 100 when every principle is in range', () => {
    expect(grade(objective, { 'elbow-flare': 10 }).score).toBe(100);
  });

  it('deducts for an out-of-range principle', () => {
    const result = grade(objective, { 'elbow-flare': 30 });
    expect(result.score).toBeLessThan(100);
    expect(result.deductions).toHaveLength(1);
  });

  it('throws when a measurement is missing (negative path)', () => {
    expect(() => grade(objective, {})).toThrow(/no measurement/);
  });
});
