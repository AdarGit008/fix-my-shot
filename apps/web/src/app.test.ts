import { describe, expect, it } from 'vitest';
import type { Pose } from '@fix-my-shot/core';
import { OBJECTIVE, PHASES } from '@fix-my-shot/basketball';
import { grade } from '@fix-my-shot/scoring';

// The app depends on the whole package seam; this asserts the wiring resolves and grades a
// pose end-to-end through core → basketball data → scoring, without pulling in a DOM renderer.
describe('app wiring', () => {
  it('grades a follow-through pose through the package seam', () => {
    const followThrough = PHASES.find((p) => p.id === 'follow-through');
    if (!followThrough) throw new Error('follow-through phase missing');

    const pose: Pose = {
      phase: followThrough,
      jointAngles: {},
      implement: { id: 'ball', position: [0, 0, 0] },
    };
    const report = grade(pose, OBJECTIVE, {
      'terminal-wrist-flexion': true,
      'head-stabilized': true,
      'repeatable-symmetric-geometry': true,
    });

    expect(report.phase).toBe('follow-through');
    expect(report.grade).toBe(100);
    expect(report.principleResults).toHaveLength(3);
  });
});
