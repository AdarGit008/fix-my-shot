import { describe, expect, it } from 'vitest';
import { OBJECTIVE } from '@fix-my-shot/basketball';
import { grade } from '@fix-my-shot/scoring';

// The app depends on the whole package seam; this asserts the wiring resolves and
// grades end-to-end without pulling in a DOM renderer.
describe('app wiring', () => {
  it('grades the basketball objective through the package seam', () => {
    expect(grade(OBJECTIVE, { 'elbow-flare': 10 }).score).toBe(100);
  });
});
