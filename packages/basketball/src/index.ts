// @fix-my-shot/basketball — the per-sport plugin.
//
// This is the ONLY place sport vocabulary belongs (ADR-0006). It supplies the concrete
// phase labels and the principle baseline as data for @fix-my-shot/core's abstract
// shapes. Real principle ranges are ported from docs/principles-baseline.md in later
// issues (#7 interfaces, #11 scorer); this scaffold carries one placeholder range so
// the seam is exercised end-to-end.

import type { FormObjective, Phase, PrincipleRange } from '@fix-my-shot/core';

/** The five shooting-form phases (docs/principles-baseline.md, ADR-0002). */
export const PHASES: readonly Phase[] = [
  { id: 'stance', index: 0 },
  { id: 'dip', index: 1 },
  { id: 'loading', index: 2 },
  { id: 'set-release', index: 3 },
  { id: 'follow-through', index: 4 },
];

/** Placeholder principle ranges — real values arrive from the principles baseline (issue #11). */
export const PRINCIPLES: readonly PrincipleRange[] = [
  { id: 'elbow-flare', phase: 'set-release', min: 0, max: 15, unit: 'deg' },
];

/** The basketball form objective handed to the sport-agnostic scorer. */
export const OBJECTIVE: FormObjective = { principles: PRINCIPLES };
