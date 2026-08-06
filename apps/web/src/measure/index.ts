// The app-side grading entry point (issue #11): qpos + phase label → Report,
// wiring the engine adapter (snapshot), the basketball plugin (objective +
// recipes), and the sport-agnostic scorer. This is the re-grade the core
// loop's edit step calls (#14 wires it into the shell).

import type { Pose, Report } from '@fix-my-shot/core';
import { OBJECTIVE, PHASES, RECIPES, type PhaseId } from '@fix-my-shot/basketball';
import { grade, measureAll } from '@fix-my-shot/scoring';
import type { GateEngine } from '../gate';
import { snapshotQpos } from './snapshot';

export { snapshotQpos } from './snapshot';

/**
 * Grade a phase-labelled qpos: snapshot → phase-appropriate measurements →
 * ADR-0008 aggregation. Deterministic; an invalid pose must be gate-rejected
 * BEFORE grading (SPEC acceptance #2) — this function does not re-check.
 */
export function gradeQpos(engine: GateEngine, phase: PhaseId, qpos: ArrayLike<number>): Report {
  const snapshot = snapshotQpos(engine, phase, qpos);
  const measurements = measureAll(snapshot, OBJECTIVE, RECIPES);
  const corePhase = PHASES.find((p) => p.id === phase)!;
  const pose: Pose = {
    phase: corePhase,
    jointAngles: {},
    implement: snapshot.implement,
  };
  return grade(pose, OBJECTIVE, measurements);
}
