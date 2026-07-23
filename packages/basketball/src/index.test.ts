import { describe, expect, it } from 'vitest';
import { BASELINE, OBJECTIVE, PHASES, PRINCIPLES } from './index';

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

  it('labels every phase', () => {
    expect(PHASES.every((p) => p.label.length > 0)).toBe(true);
  });

  it('transcribes the full baseline (36 principles across the five phase tables)', () => {
    expect(BASELINE).toHaveLength(36);
    expect(new Set(BASELINE.map((p) => p.id)).size).toBe(36); // ids are unique
  });

  it('exposes the scored principles on the objective (the one deferred row excluded)', () => {
    expect(PRINCIPLES).toHaveLength(35);
    expect(OBJECTIVE.principles).toBe(PRINCIPLES);
    const deferred = BASELINE.filter((p) => p.tier === 'deferred');
    expect(deferred).toHaveLength(1);
    expect(PRINCIPLES.some((p) => p.id === deferred[0]?.id)).toBe(false);
  });

  it('scopes every principle to a declared phase', () => {
    const phaseIds = new Set(PHASES.map((p) => p.id));
    expect(BASELINE.every((p) => phaseIds.has(p.phase))).toBe(true);
  });
});
