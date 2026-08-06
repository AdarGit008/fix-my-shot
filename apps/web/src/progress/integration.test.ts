/* The issue-#13 Done-when, driven with REAL reports end-to-end: across two
 * sessions (a faulted dip, then the fixed dip) the stored history alone
 * yields the prior top fix, whether it improved, and the per-principle trend.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PhaseId } from '@fix-my-shot/basketball';

import sceneXml from '../spike/scene.xml?raw';
import { POSE_LIBRARY } from '../poses';
import { createGate, loadGateEngine, type Gate } from '../gate';
import { buildReport } from '../report';
import {
  createProgressStore,
  entryFromReport,
  principleTrend,
  topFixContinuity,
  type StorageLike,
} from './store';

function fakeStorage(): StorageLike {
  const raw = new Map<string, string>();
  return {
    getItem: (k) => raw.get(k) ?? null,
    setItem: (k, v) => void raw.set(k, v),
    removeItem: (k) => void raw.delete(k),
  };
}

describe('two real sessions through the store (issue #13 Done-when)', () => {
  let engine: Awaited<ReturnType<typeof loadGateEngine>>;
  let gate: Gate;

  beforeAll(async () => {
    engine = await loadGateEngine(sceneXml);
    gate = createGate(engine);
  }, 30000);

  afterAll(() => {
    gate.dispose();
    engine.dispose();
  });

  it('shows the prior top fix, its improvement, and the trend — from storage alone', () => {
    const faulted = POSE_LIBRARY.poses.find((p) => p.id === 'dip-unloaded-straight-knee-00')!;
    const fixed = POSE_LIBRARY.poses.find((p) => p.id === 'dip-clean')!;

    const storage = fakeStorage();
    const store = createProgressStore(storage);

    // Session 1: the user works a faulted pose; the report names a top fix.
    const first = buildReport(engine, gate, faulted.phase as PhaseId, faulted.qpos);
    expect(first.fixes.length).toBeGreaterThan(0);
    store.record(entryFromReport('session-1', '2026-08-06T10:00:00Z', faulted.id, first));

    // Session 2: they fixed the form (the clean dip embodies the fix).
    const second = buildReport(engine, gate, fixed.phase as PhaseId, fixed.qpos);
    store.record(entryFromReport('session-2', '2026-08-07T10:00:00Z', fixed.id, second));

    // Everything below reads only what a fresh page load would read: a new
    // store over the same underlying storage.
    const entries = createProgressStore(storage).entries();

    const continuity = topFixContinuity(entries);
    expect(continuity.prior).not.toBeNull();
    expect(continuity.prior!.principleId).toBe(first.fixes[0]!.principleId);
    expect(continuity.prior!.cue.length).toBeGreaterThan(0);
    expect(continuity.improved).toBe(true);
    expect(continuity.recoveredPoints!).toBeGreaterThan(0);

    const trend = principleTrend(entries, continuity.prior!.principleId);
    expect(trend).toHaveLength(2);
    expect(trend[0]!.satisfied).toBe(false);
    expect(trend[1]!.satisfied).toBe(true);
    expect(trend[1]!.atStake).toBe(0);

    // The grade movement is visible in history too.
    expect(entries[1]!.grade).toBeGreaterThan(entries[0]!.grade);
  });
});
