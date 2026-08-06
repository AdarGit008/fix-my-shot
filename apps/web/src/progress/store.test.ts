import { describe, expect, it } from 'vitest';
import type { Report } from '@fix-my-shot/core';
import {
  MAX_ENTRIES,
  continuityAgainstReport,
  createProgressStore,
  entryFromReport,
  principleTrend,
  topFixContinuity,
  type SessionEntry,
  type StorageLike,
} from './store';

function fakeStorage(): StorageLike & { raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return {
    raw,
    getItem: (k) => raw.get(k) ?? null,
    setItem: (k, v) => void raw.set(k, v),
    removeItem: (k) => void raw.delete(k),
  };
}

function entry(overrides: Partial<SessionEntry> & { sessionId: string }): SessionEntry {
  return {
    at: '2026-08-06T00:00:00Z',
    poseId: 'dip-clean',
    phase: 'dip',
    grade: 90,
    principles: {},
    topFix: null,
    ...overrides,
  };
}

describe('progress store', () => {
  it('starts empty, records, survives a reload round-trip, and clears', () => {
    const storage = fakeStorage();
    const store = createProgressStore(storage);
    expect(store.entries()).toEqual([]);

    store.record(entry({ sessionId: 's1' }));
    store.record(entry({ sessionId: 's2', grade: 95 }));
    expect(store.entries().map((e) => e.sessionId)).toEqual(['s1', 's2']);

    // A second store over the same storage sees the same history (reload).
    const reloaded = createProgressStore(storage);
    expect(reloaded.entries()).toHaveLength(2);

    store.clear();
    expect(store.entries()).toEqual([]);
  });

  it('re-recording a sessionId upserts instead of duplicating (one line per sitting)', () => {
    const store = createProgressStore(fakeStorage());
    store.record(entry({ sessionId: 's1', grade: 70 }));
    store.record(entry({ sessionId: 's1', grade: 84 }));
    const entries = store.entries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.grade).toBe(84);
  });

  it('reads corrupt or future-versioned storage as empty, gracefully', () => {
    const storage = fakeStorage();
    storage.setItem('fix-my-shot/progress', '{not json');
    expect(createProgressStore(storage).entries()).toEqual([]);
    storage.setItem('fix-my-shot/progress', JSON.stringify({ version: 99, entries: [{}] }));
    expect(createProgressStore(storage).entries()).toEqual([]);
  });

  it('caps history at MAX_ENTRIES, dropping the oldest', () => {
    const store = createProgressStore(fakeStorage());
    for (let i = 0; i < MAX_ENTRIES + 5; i++) {
      store.record(entry({ sessionId: `s${i}` }));
    }
    const entries = store.entries();
    expect(entries).toHaveLength(MAX_ENTRIES);
    expect(entries[0]!.sessionId).toBe('s5');
  });

  it('entryFromReport captures grade, per-principle results, and the top fix', () => {
    const report: Report = {
      grade: 74.5,
      phase: 'dip',
      principleResults: [
        {
          principleId: 'load-presence',
          tier: 'guideline',
          criterion: { kind: 'presence' },
          measured: true,
          satisfied: false,
          deduction: 12,
          atStake: 12,
        },
      ],
      fixes: [
        { principleId: 'load-presence', cluster: 'base', cue: 'Load the floor evenly.', leverage: 12 },
      ],
    };
    const e = entryFromReport('s1', '2026-08-06T00:00:00Z', 'dip-unloaded-straight-knee-00', report);
    expect(e.grade).toBe(74.5);
    expect(e.principles['load-presence']!.atStake).toBe(12);
    expect(e.topFix!.principleId).toBe('load-presence');
  });
});

describe('principleTrend', () => {
  it('collects only sessions where the principle was measured', () => {
    const entries = [
      entry({
        sessionId: 's1',
        principles: {
          knee: { tier: 'guideline', measured: true, satisfied: false, atStake: 9 },
        },
      }),
      entry({ sessionId: 's2', phase: 'stance', principles: {} }), // other phase
      entry({
        sessionId: 's3',
        principles: {
          knee: { tier: 'guideline', measured: true, satisfied: true, atStake: 0 },
        },
      }),
    ];
    const trend = principleTrend(entries, 'knee');
    expect(trend.map((t) => t.sessionId)).toEqual(['s1', 's3']);
    expect(trend[0]!.atStake).toBe(9);
    expect(trend[1]!.satisfied).toBe(true);
  });
});

describe('continuityAgainstReport (the loop page path)', () => {
  const fix = { principleId: 'knee', cluster: 'base', cue: 'Sink into the floor.', leverage: 9 };
  const reportWith = (satisfied: boolean, atStake: number): Report => ({
    grade: 80,
    phase: 'dip',
    fixes: [],
    principleResults: [
      {
        principleId: 'knee',
        tier: 'guideline',
        criterion: { kind: 'band', min: 90, max: 130, unit: 'deg' },
        measured: true,
        satisfied,
        deduction: atStake,
        atStake,
      },
    ],
  });

  it('compares the LAST stored sitting against the live report', () => {
    const entries = [
      entry({
        sessionId: 's1',
        topFix: fix,
        principles: { knee: { tier: 'guideline', measured: true, satisfied: false, atStake: 9 } },
      }),
    ];
    const improved = continuityAgainstReport(entries, reportWith(true, 0));
    expect(improved.prior).toEqual(fix);
    expect(improved.improved).toBe(true);
    expect(improved.recoveredPoints).toBeCloseTo(9);

    const stuck = continuityAgainstReport(entries, reportWith(false, 9));
    expect(stuck.improved).toBe(false);
  });

  it('answers null when the live report does not measure the prior principle', () => {
    const entries = [
      entry({
        sessionId: 's1',
        topFix: fix,
        principles: { knee: { tier: 'guideline', measured: true, satisfied: false, atStake: 9 } },
      }),
    ];
    const other: Report = { grade: 100, phase: 'stance', fixes: [], principleResults: [] };
    const continuity = continuityAgainstReport(entries, other);
    expect(continuity.prior).toEqual(fix);
    expect(continuity.improved).toBeNull();
  });

  it('has nothing to pick up from an empty history or a clean last sitting', () => {
    expect(continuityAgainstReport([], reportWith(true, 0)).prior).toBeNull();
    expect(
      continuityAgainstReport([entry({ sessionId: 's1', topFix: null })], reportWith(true, 0))
        .prior,
    ).toBeNull();
  });
});

describe('topFixContinuity', () => {
  const fix = { principleId: 'knee', cluster: 'base', cue: 'Sink into the floor.', leverage: 9 };

  it('needs two sessions', () => {
    expect(topFixContinuity([entry({ sessionId: 's1' })]).prior).toBeNull();
  });

  it('reports improvement when the prior top fix now holds fewer points', () => {
    const continuity = topFixContinuity([
      entry({
        sessionId: 's1',
        topFix: fix,
        principles: { knee: { tier: 'guideline', measured: true, satisfied: false, atStake: 9 } },
      }),
      entry({
        sessionId: 's2',
        principles: { knee: { tier: 'guideline', measured: true, satisfied: true, atStake: 0 } },
      }),
    ]);
    expect(continuity.prior).toEqual(fix);
    expect(continuity.improved).toBe(true);
    expect(continuity.recoveredPoints).toBeCloseTo(9);
  });

  it('reports non-improvement when the stake did not move', () => {
    const stuck = { tier: 'guideline', measured: true, satisfied: false, atStake: 9 };
    const continuity = topFixContinuity([
      entry({ sessionId: 's1', topFix: fix, principles: { knee: stuck } }),
      entry({ sessionId: 's2', principles: { knee: stuck } }),
    ]);
    expect(continuity.improved).toBe(false);
    expect(continuity.recoveredPoints).toBeCloseTo(0);
  });

  it('returns improved: null when no later session measures the principle', () => {
    const continuity = topFixContinuity([
      entry({
        sessionId: 's1',
        topFix: fix,
        principles: { knee: { tier: 'guideline', measured: true, satisfied: false, atStake: 9 } },
      }),
      entry({ sessionId: 's2', phase: 'stance', principles: {} }),
    ]);
    expect(continuity.prior).toEqual(fix);
    expect(continuity.improved).toBeNull();
  });

  it('returns no continuity when the previous session had nothing to fix', () => {
    const continuity = topFixContinuity([
      entry({ sessionId: 's1', topFix: null }),
      entry({ sessionId: 's2' }),
    ]);
    expect(continuity.prior).toBeNull();
  });
});
