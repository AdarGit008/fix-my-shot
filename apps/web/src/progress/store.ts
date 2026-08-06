// Minimal v1 persistence (issue #13, ADR-0007): localStorage-only session
// history with the two derived signals the moat needs — the per-principle
// trend across sessions and TOP-FIX CONTINUITY (the app remembers the current
// top fix and shows whether it improved). No backend, no account; storage
// injected behind a two-method interface so the logic is engine- and
// DOM-free (tests run on an in-memory fake; the page passes localStorage).
//
// A "session" is one loaded pose being worked on: re-grades within it UPSERT
// the same entry (keyed by sessionId), so history reads one line per sitting,
// not one line per drag. Corrupt or versioned-ahead payloads reset gracefully
// to empty — cleared storage is a supported state, never an error.

import type { Report } from '@fix-my-shot/core';

/** The subset of Web Storage the store needs (localStorage satisfies it). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** One principle's outcome inside a stored session (the trend's raw material). */
export interface StoredPrinciple {
  readonly tier: string;
  readonly measured: boolean;
  readonly satisfied: boolean;
  readonly atStake: number;
}

/** The stored top fix of a session (display decor included — history must
 * render without recomputing anything). */
export interface StoredTopFix {
  readonly principleId: string;
  readonly cluster: string;
  readonly cue: string;
  readonly leverage: number;
}

/** One session line: pose id/phase, grade, per-principle results, top fix. */
export interface SessionEntry {
  readonly sessionId: string;
  /** ISO timestamp, supplied by the caller (keeps the store deterministic). */
  readonly at: string;
  readonly poseId: string;
  readonly phase: string;
  readonly grade: number;
  readonly principles: Readonly<Record<string, StoredPrinciple>>;
  readonly topFix: StoredTopFix | null;
}

const KEY = 'fix-my-shot/progress';
const VERSION = 1;
/** History cap: oldest sessions fall off past this. */
export const MAX_ENTRIES = 200;

interface Payload {
  version: number;
  entries: SessionEntry[];
}

function load(storage: StorageLike): SessionEntry[] {
  const raw = storage.getItem(KEY);
  if (raw === null) return [];
  try {
    const payload = JSON.parse(raw) as Payload;
    if (payload.version !== VERSION || !Array.isArray(payload.entries)) return [];
    return payload.entries;
  } catch {
    return []; // corrupt storage reads as empty — never an error
  }
}

function save(storage: StorageLike, entries: SessionEntry[]): void {
  const payload: Payload = { version: VERSION, entries };
  storage.setItem(KEY, JSON.stringify(payload));
}

export interface ProgressStore {
  /** Append — or, for an already-recorded sessionId, replace — one session. */
  record(entry: SessionEntry): void;
  /** All stored sessions, oldest first. */
  entries(): SessionEntry[];
  /** Wipe the history. */
  clear(): void;
}

export function createProgressStore(storage: StorageLike): ProgressStore {
  return {
    record(entry) {
      const entries = load(storage).filter((e) => e.sessionId !== entry.sessionId);
      entries.push(entry);
      save(storage, entries.slice(-MAX_ENTRIES));
    },
    entries() {
      return load(storage);
    },
    clear() {
      storage.removeItem(KEY);
    },
  };
}

/** Build a session entry from a graded report (the #14 loop calls this on
 * every re-grade of the current session). */
export function entryFromReport(
  sessionId: string,
  at: string,
  poseId: string,
  report: Report,
): SessionEntry {
  const principles: Record<string, StoredPrinciple> = {};
  for (const result of report.principleResults) {
    principles[result.principleId] = {
      tier: result.tier,
      measured: result.measured,
      satisfied: result.satisfied,
      atStake: result.atStake,
    };
  }
  return {
    sessionId,
    at,
    poseId,
    phase: report.phase,
    grade: report.grade,
    principles,
    topFix: report.fixes[0] ?? null,
  };
}

/** One point of a principle's trend: a session where it was measured. */
export interface TrendPoint {
  readonly at: string;
  readonly sessionId: string;
  readonly satisfied: boolean;
  readonly atStake: number;
}

/** The sessions (oldest first) in which `principleId` was actually measured. */
export function principleTrend(entries: readonly SessionEntry[], principleId: string): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (const entry of entries) {
    const p = entry.principles[principleId];
    if (!p || !p.measured) continue;
    points.push({ at: entry.at, sessionId: entry.sessionId, satisfied: p.satisfied, atStake: p.atStake });
  }
  return points;
}

/** Top-fix continuity (the ADR-0007 loop): the prior session's top fix and
 * whether it improved by the most recent session that measures it. */
export interface TopFixContinuity {
  /** The top fix recorded by the previous session (null: fewer than 2 sessions
   * or the previous session had nothing to fix). */
  readonly prior: StoredTopFix | null;
  /** The session that carried `prior`. */
  readonly priorSessionId: string | null;
  /**
   * Whether the prior top fix improved: true when its principle is now
   * satisfied or holds fewer points at stake in the latest session measuring
   * it; false when unchanged/worse; null when no later session measures it
   * (e.g. every later session was a different phase).
   */
  readonly improved: boolean | null;
  /** The at-stake movement (prior − latest), positive = improvement. */
  readonly recoveredPoints: number | null;
}

export function topFixContinuity(entries: readonly SessionEntry[]): TopFixContinuity {
  const none: TopFixContinuity = {
    prior: null,
    priorSessionId: null,
    improved: null,
    recoveredPoints: null,
  };
  if (entries.length < 2) return none;
  const previous = entries[entries.length - 2]!;
  if (!previous.topFix) return none;
  const prior = previous.topFix;
  const then = previous.principles[prior.principleId];

  // The most recent LATER session that measures the prior fix's principle.
  let now: StoredPrinciple | null = null;
  for (let i = entries.length - 1; i > entries.indexOf(previous); i--) {
    const candidate = entries[i]!.principles[prior.principleId];
    if (candidate?.measured) {
      now = candidate;
      break;
    }
  }
  if (!now || !then) {
    return { prior, priorSessionId: previous.sessionId, improved: null, recoveredPoints: null };
  }
  const recoveredPoints = then.atStake - now.atStake;
  const improved = (now.satisfied && !then.satisfied) || recoveredPoints > 1e-9;
  return { prior, priorSessionId: previous.sessionId, improved, recoveredPoints };
}
