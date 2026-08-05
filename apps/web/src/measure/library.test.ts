/* The issue-#11 "Done when", held against the whole shipped library: every
 * pose returns a defensible 0–100 grade with the right per-principle in/out
 * calls — clean poses grade high with no stone broken, every injected fault
 * reads as its principle, in-range style is never penalized, unmeasurable
 * principles are reported honestly, and grading is deterministic.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PhaseId } from '@fix-my-shot/basketball';

import sceneXml from '../spike/scene.xml?raw';
import { POSE_LIBRARY } from '../poses';
import { loadGateEngine } from '../gate';
import { gradeQpos } from './index';

type Engine = Awaited<ReturnType<typeof loadGateEngine>>;

/** Principles the current humanoid honestly cannot read (no wrist/finger DOF;
 * no cross-session history) — the ONLY ones allowed to be unmeasured. */
const UNMEASURABLE = new Set([
  'wrist-cocked',
  'wrist-snap-gooseneck',
  'repeatable-symmetric-geometry',
]);

describe('scorer vs the shipped pose library (issue #11 Done-when)', () => {
  let engine: Engine;

  beforeAll(async () => {
    engine = await loadGateEngine(sceneXml);
  }, 30000);

  afterAll(() => {
    engine.dispose();
  });

  const report = (pose: (typeof POSE_LIBRARY.poses)[number]) =>
    gradeQpos(engine, pose.phase as PhaseId, pose.qpos);

  it('every clean pose grades ≥ 95 with no written-in-stone broken', () => {
    for (const pose of POSE_LIBRARY.poses.filter((p) => p.kind === 'clean')) {
      const r = report(pose);
      expect(r.grade, `${pose.id} graded ${r.grade}`).toBeGreaterThanOrEqual(95);
      const brokenStones = r.principleResults.filter(
        (p) => p.tier === 'written-in-stone' && !p.satisfied,
      );
      expect(brokenStones, `${pose.id} broke ${brokenStones.map((b) => b.principleId)}`).toEqual(
        [],
      );
    }
  });

  it('every injected fault reads as its principle (unsatisfied in the report)', () => {
    for (const pose of POSE_LIBRARY.poses.filter((p) => p.kind === 'faulted')) {
      const r = report(pose);
      for (const principleId of new Set(pose.faults.map((f) => f.principle))) {
        const result = r.principleResults.find((p) => p.principleId === principleId);
        expect(result, `${pose.id}: no result for ${principleId}`).toBeDefined();
        expect(result!.satisfied, `${pose.id}: ${principleId} not caught`).toBe(false);
        expect(result!.measured).toBe(true);
      }
    }
  });

  it('a fault against a deducting tier lowers the grade below its phase-clean pose', () => {
    const cleanGrade = new Map<string, number>();
    for (const pose of POSE_LIBRARY.poses.filter((p) => p.kind === 'clean')) {
      cleanGrade.set(pose.phase, report(pose).grade);
    }
    for (const pose of POSE_LIBRARY.poses.filter((p) => p.kind === 'faulted')) {
      const r = report(pose);
      const faultTiers = new Set(
        r.principleResults
          .filter((p) => pose.faults.some((f) => f.principle === p.principleId))
          .map((p) => p.tier),
      );
      const clean = cleanGrade.get(pose.phase)!;
      if (faultTiers.has('written-in-stone')) {
        expect(r.grade, `${pose.id}: stone fault not capped`).toBeLessThanOrEqual(60);
      } else if (faultTiers.has('guideline')) {
        expect(r.grade, `${pose.id}: guideline fault did not lower the grade`).toBeLessThan(clean);
      } else {
        // Style-variant faults are flags: the grade must NOT drop for style.
        expect(r.grade, `${pose.id}: style fault deducted`).toBeGreaterThanOrEqual(clean);
      }
    }
  });

  it('in-range style is never penalized: style-variant rows always deduct zero', () => {
    for (const pose of POSE_LIBRARY.poses) {
      for (const result of report(pose).principleResults) {
        if (result.tier === 'style-variant') {
          expect(result.deduction, `${pose.id}: ${result.principleId}`).toBe(0);
        }
        if (result.satisfied) {
          expect(result.deduction, `${pose.id}: satisfied ${result.principleId} deducted`).toBe(0);
        }
      }
    }
  });

  it('exactly the documented unmeasurable principles read as unmeasured', () => {
    for (const pose of POSE_LIBRARY.poses) {
      const unmeasured = report(pose)
        .principleResults.filter((p) => !p.measured)
        .map((p) => p.principleId);
      for (const id of unmeasured) {
        expect(UNMEASURABLE.has(id), `${pose.id}: unexpected unmeasured '${id}'`).toBe(true);
      }
    }
  });

  it('grading is deterministic: identical reports on repeated evaluation', () => {
    for (const pose of POSE_LIBRARY.poses.slice(0, 6)) {
      expect(report(pose)).toEqual(report(pose));
    }
  });

  it('grades stay inside [0, 100] across the whole library', () => {
    for (const pose of POSE_LIBRARY.poses) {
      const r = report(pose);
      expect(r.grade).toBeGreaterThanOrEqual(0);
      expect(r.grade).toBeLessThanOrEqual(100);
      expect(r.phase).toBe(pose.phase);
    }
  });
});
