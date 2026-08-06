// The per-principle fix decor (issue #12, ADR-0005/0008/0009): the BEEF-style
// cluster each principle reports under, and its EXTERNAL-FOCUS cue — phrased
// at the target / ball / arc / floor, never at body parts (awareness now,
// automaticity later; SPEC acceptance #6). Where no honest external phrasing
// exists, the row records the sanctioned wording and says so
// (`sanctioned: true`) — exactly the ADR-0009 escape hatch. cues.test.ts
// enforces the discipline: an unsanctioned cue may name no anatomy.

import type { FixDecor } from '@fix-my-shot/scoring';
import { PRINCIPLES } from './baseline';

/** The four coach-meaningful clusters (ADR-0004/0008 — BEEF-style). */
export const CLUSTERS = ['base', 'eyes', 'elbow-alignment', 'follow-through'] as const;
export type ClusterId = (typeof CLUSTERS)[number];

export interface CueEntry extends FixDecor {
  readonly cluster: ClusterId;
  /** True when the wording is the recorded sanctioned INTERNAL phrasing
   * (no honest external-focus phrasing exists for this principle). */
  readonly sanctioned: boolean;
}

export const CUES: Readonly<Record<string, CueEntry>> = {
  // ── Stance / Preparation ─────────────────────────────────────────────────
  'com-inside-base': {
    cluster: 'base',
    cue: 'Rise straight at the rim from the middle of your base.',
    sanctioned: false,
  },
  'both-feet-grounded': {
    cluster: 'base',
    cue: 'Keep the whole floor under you until the ball starts up.',
    sanctioned: false,
  },
  'stance-width': {
    cluster: 'base',
    // No honest external referent for body width — recorded sanctioned wording.
    cue: 'Set the feet about shoulder-width apart, and keep that base every time.',
    sanctioned: true,
  },
  'foot-stagger': {
    cluster: 'base',
    cue: 'Let the shooting-side foot sit slightly ahead — the same amount every time.',
    sanctioned: true,
  },
  'erect-torso': {
    cluster: 'base',
    cue: 'Stay tall to the rim through the set.',
    sanctioned: false,
  },
  'trunk-inclination': {
    cluster: 'base',
    cue: 'Keep your line to the rim steady — no swaying off it.',
    sanctioned: false,
  },
  'shoulders-squared': {
    cluster: 'base',
    cue: 'Square up to the rim before the ball rises.',
    sanctioned: false,
  },
  'head-toward-target': {
    cluster: 'eyes',
    cue: 'Find the rim early and hold it.',
    sanctioned: false,
  },
  'early-target-acquisition': {
    cluster: 'eyes',
    cue: 'Lock onto the rim before the ball ever moves.',
    sanctioned: false,
  },

  // ── Dip / Gather ─────────────────────────────────────────────────────────
  'knee-flexion': {
    cluster: 'base',
    cue: 'Sink into the floor before you ride up to the rim.',
    sanctioned: false,
  },
  'hip-flexion': {
    cluster: 'base',
    cue: 'Sit into the load while staying tall to the rim.',
    sanctioned: false,
  },
  'deep-elbow-flexion': {
    cluster: 'elbow-alignment',
    cue: 'Let the ball dip low and close before it rides up.',
    sanctioned: false,
  },
  'load-presence': {
    cluster: 'base',
    cue: 'Load the floor evenly — both sides — before the ball rises.',
    sanctioned: false,
  },

  // ── Loading / Ball-elevation ─────────────────────────────────────────────
  'sequential-leg-extension': {
    cluster: 'base',
    cue: 'Push the floor away and let that push carry the ball up.',
    sanctioned: false,
  },
  'elbow-under-loading': {
    cluster: 'elbow-alignment',
    cue: 'Keep the ball riding up a straight rail to the rim.',
    sanctioned: false,
  },
  'shoulder-elevation': {
    cluster: 'elbow-alignment',
    cue: 'Carry the ball up ahead of you toward the rim.',
    sanctioned: false,
  },
  'wrist-cocked': {
    cluster: 'follow-through',
    cue: 'Load the ball back on its shelf before the ride up.',
    sanctioned: false,
  },
  'guide-hand': {
    cluster: 'elbow-alignment',
    cue: 'Steady the ball from the side — never steer it.',
    sanctioned: false,
  },
  'proximal-distal': {
    cluster: 'base',
    cue: 'Let the push from the floor reach the ball last.',
    sanctioned: false,
  },
  'one-motion-continuity': {
    cluster: 'elbow-alignment',
    cue: 'One ride: the ball rises as the floor-push rises.',
    sanctioned: false,
  },

  // ── Set point / Release ──────────────────────────────────────────────────
  'near-full-elbow-extension': {
    cluster: 'elbow-alignment',
    cue: 'Reach the ball all the way up toward the rim at the release.',
    sanctioned: false,
  },
  'set-release-height': {
    cluster: 'elbow-alignment',
    cue: 'Release the ball at the top of your reach.',
    sanctioned: false,
  },
  'elbow-flare-release': {
    cluster: 'elbow-alignment',
    cue: 'Send the ball up a straight rail — no drifting off the line to the rim.',
    sanctioned: false,
  },
  'trunk-at-release': {
    cluster: 'base',
    cue: 'Rise straight up through the release — no leaning at the rim.',
    sanctioned: false,
  },
  'ball-on-finger-pads': {
    cluster: 'follow-through',
    // Hand/ball micro-geometry has no external referent — sanctioned wording.
    cue: 'Hold the ball on the finger pads with daylight under the palm.',
    sanctioned: true,
  },
  'hand-behind-under': {
    cluster: 'elbow-alignment',
    cue: 'Get the shooting hand behind and under the ball, pointing it at the rim.',
    sanctioned: true,
  },
  'square-hand': {
    cluster: 'elbow-alignment',
    cue: "Keep the ball's seams spinning straight back at the rim.",
    sanctioned: false,
  },
  'wrist-snap-gooseneck': {
    cluster: 'follow-through',
    cue: 'Flick the ball out and down over the front of the rim.',
    sanctioned: false,
  },
  'eyes-on-target': {
    cluster: 'eyes',
    cue: 'Hold the rim in view until the ball is gone.',
    sanctioned: false,
  },
  'unobstructed-sightline': {
    cluster: 'eyes',
    cue: 'Keep a clear window to the rim around the ball.',
    sanctioned: false,
  },
  'set-point-height-motion': {
    cluster: 'elbow-alignment',
    cue: 'Keep your set point — wherever it is — the same every time.',
    sanctioned: false,
  },
  'base-extended': {
    cluster: 'base',
    cue: 'Finish the floor-push before the ball leaves.',
    sanctioned: false,
  },

  // ── Follow-through / Inertia ─────────────────────────────────────────────
  'terminal-wrist-flexion': {
    cluster: 'follow-through',
    cue: 'Hold the finish — reach over the rim until the ball gets there.',
    sanctioned: false,
  },
  'head-stabilized': {
    cluster: 'base',
    cue: 'Land tall where you rose — steady at the rim.',
    sanctioned: false,
  },
  'repeatable-symmetric-geometry': {
    cluster: 'follow-through',
    cue: 'Make this finish the same finish, every time.',
    sanctioned: false,
  },
};

/**
 * Decor lookup for the leverage ranking: every scored principle must have an
 * entry (cues.test.ts holds the completeness + external-focus discipline).
 */
export function fixDecor(principleId: string): CueEntry {
  const entry = CUES[principleId];
  if (!entry) throw new Error(`no cue entry for principle '${principleId}'`);
  return entry;
}

/** Completeness guard used by the tests: ids the cue table must cover. */
export const CUE_COVERAGE: readonly string[] = PRINCIPLES.map((p) => p.id);
