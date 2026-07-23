// @fix-my-shot/basketball — the per-sport plugin.
//
// This is the ONLY place sport vocabulary belongs (ADR-0006). It supplies the concrete phase
// labels (phases.ts), the principle baseline transcribed from docs/principles-baseline.md as
// data (baseline.ts — round-tripped against the doc by test/principles-drift.test.ts), and
// the scene specifics: virtual-target geometry + contact encodings (scene.ts). The scorer in
// @fix-my-shot/scoring consumes the exported OBJECTIVE without ever naming a sport.

export { PHASES, type PhaseId } from './phases';
export {
  BASELINE,
  OBJECTIVE,
  PRINCIPLES,
  type BaselinePrinciple,
  type BaselineTier,
} from './baseline';
export {
  BALL,
  FREE_THROW_TARGET,
  type BallSpec,
  type FootContact,
  type HandBallContact,
  type TargetGeometry,
} from './scene';
