import { describe, expect, it } from 'vitest';
import { OBJECTIVE, PHASES, PRINCIPLES } from './index';

describe('basketball plugin', () => {
  it('declares the five shooting-form phases in order', () => {
    expect(PHASES.map((p) => p.id)).toEqual([
      'stance',
      'dip',
      'loading',
      'set-release',
      'follow-through',
    ]);
  });

  it('exposes at least one principle range on the objective', () => {
    expect(PRINCIPLES.length).toBeGreaterThan(0);
    expect(OBJECTIVE.principles).toBe(PRINCIPLES);
  });
});
