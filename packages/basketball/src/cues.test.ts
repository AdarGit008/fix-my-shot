import { describe, expect, it } from 'vitest';
import { CLUSTERS, CUES, CUE_COVERAGE, fixDecor } from './cues';

// The cue-table discipline (issue #12, ADR-0005/0009, SPEC acceptance #6):
// complete coverage of the scored principles, only the four BEEF-style
// clusters, and — the load-bearing one — an UNsanctioned cue may name no
// anatomy: external focus speaks at the target / ball / arc / floor. Rows
// where no honest external phrasing exists are explicitly sanctioned, which
// is ADR-0009's recorded-wording escape hatch, not a free pass.

/** Anatomy vocabulary an external-focus cue must not use. */
const ANATOMY =
  /\b(elbow|wrist|knee|hip|arm|arms|hand|hands|shoulder|shoulders|head|trunk|torso|leg|legs|finger|fingers|palm|foot|feet|heel|heels|toe|toes|chest|chin|eye|eyes)\b/i;

describe('the per-principle cue table', () => {
  it('covers every scored principle', () => {
    for (const id of CUE_COVERAGE) {
      expect(CUES[id], `no cue entry for '${id}'`).toBeDefined();
    }
  });

  it('uses only the four BEEF-style clusters', () => {
    for (const [id, entry] of Object.entries(CUES)) {
      expect(CLUSTERS, `${id} has unknown cluster '${entry.cluster}'`).toContain(entry.cluster);
    }
  });

  it('every cue is a real sentence', () => {
    for (const [id, entry] of Object.entries(CUES)) {
      expect(entry.cue.trim().length, `${id} cue empty`).toBeGreaterThan(10);
    }
  });

  it('an unsanctioned cue names no anatomy (external focus only)', () => {
    for (const [id, entry] of Object.entries(CUES)) {
      if (entry.sanctioned) continue;
      const match = entry.cue.match(ANATOMY);
      expect(match, `${id}: "${entry.cue}" names anatomy ("${match?.[0]}")`).toBeNull();
    }
  });

  it('sanctioned wording stays the exception, not the rule', () => {
    const sanctioned = Object.values(CUES).filter((entry) => entry.sanctioned).length;
    expect(sanctioned).toBeLessThanOrEqual(Object.keys(CUES).length / 4);
  });

  it('fixDecor resolves every covered principle and throws on unknowns', () => {
    for (const id of CUE_COVERAGE) {
      expect(fixDecor(id).cue.length).toBeGreaterThan(0);
    }
    expect(() => fixDecor('no-such-principle')).toThrow(/no cue entry/);
  });
});
