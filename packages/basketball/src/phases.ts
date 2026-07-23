// The five shooting-form phases (docs/principles-baseline.md "Phase taxonomy").
// Ids/order are the stable seam keys; labels + parents are transcribed from the doc and
// round-tripped by test/principles-drift.test.ts. The five nest inside the peer-reviewed
// preparation / jump / follow-through model (the `parent` field).

import type { Phase } from '@fix-my-shot/core';

/** The stable phase ids used across the seam. */
export type PhaseId = 'stance' | 'dip' | 'loading' | 'set-release' | 'follow-through';

export const PHASES: readonly Phase[] = [
  { id: 'stance', index: 0, label: 'Stance / Preparation', parent: 'preparation' },
  { id: 'dip', index: 1, label: 'Dip / Gather' },
  { id: 'loading', index: 2, label: 'Loading / Ball-elevation', parent: 'jump' },
  { id: 'set-release', index: 3, label: 'Set point / Release' },
  { id: 'follow-through', index: 4, label: 'Follow-through / Inertia', parent: 'follow-through' },
];
