// The simple session-history view (issue #13): top-fix continuity up top —
// the prior session's fix, whether it improved, in its own external-focus
// words — then the per-session history and a compact per-principle trend.
// Reads localStorage alone; renders a friendly empty state when storage is
// missing or cleared. Recording happens in the core loop (issue #14); this
// view only ever reads.

import { useMemo } from 'react';
import { PHASES } from '@fix-my-shot/basketball';
import {
  createProgressStore,
  principleTrend,
  topFixContinuity,
  type SessionEntry,
} from './store';

function phaseLabel(id: string): string {
  return PHASES.find((p) => p.id === id)?.label ?? id;
}

function timeLabel(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso : new Date(t).toLocaleString();
}

export function ProgressPanel() {
  const entries = useMemo<SessionEntry[]>(() => {
    try {
      return createProgressStore(window.localStorage).entries();
    } catch {
      return []; // storage unavailable (private mode etc.) reads as empty
    }
  }, []);

  const continuity = useMemo(() => topFixContinuity(entries), [entries]);
  const trend = useMemo(
    () => (continuity.prior ? principleTrend(entries, continuity.prior.principleId) : []),
    [entries, continuity],
  );

  return (
    <main style={S.page}>
      <header style={S.head}>
        <h1 style={S.h1}>fix-my-shot · progress</h1>
        <p style={S.sub}>
          Session history from this browser only — no account, no upload.{' '}
          <a href="./" style={S.link}>
            ← app
          </a>
        </p>
      </header>

      {entries.length === 0 && (
        <div style={S.card}>
          <p style={S.empty}>
            No sessions yet. Edit a pose in the app — each sitting you work records here, and
            your next visit starts from your last top fix.
          </p>
        </div>
      )}

      {continuity.prior && (
        <div style={S.card}>
          <div style={S.cardTitle}>pick up where you left off</div>
          <div style={S.fixRow}>
            <span style={S.clusterChip}>{continuity.prior.cluster}</span>
            <span style={S.cue}>{continuity.prior.cue}</span>
          </div>
          {continuity.improved === true && (
            <p style={S.improved}>
              ✓ improved since — about {Math.round(continuity.recoveredPoints ?? 0)} points
              recovered on this principle.
            </p>
          )}
          {continuity.improved === false && (
            <p style={S.stalled}>not moved yet — same fix, next session.</p>
          )}
          {continuity.improved === null && (
            <p style={S.awaiting}>not re-measured yet — revisit a {`pose`} in that phase.</p>
          )}
          {trend.length > 0 && (
            <div style={S.trendRow}>
              {trend.map((point) => (
                <span
                  key={point.sessionId}
                  title={`${timeLabel(point.at)} · ${point.satisfied ? 'in range' : `${point.atStake.toFixed(0)} pts at stake`}`}
                  style={point.satisfied ? S.dotGood : S.dotBad}
                />
              ))}
              <span style={S.trendLabel}>this fix, session by session</span>
            </div>
          )}
        </div>
      )}

      {entries.length > 0 && (
        <div style={S.card}>
          <div style={S.cardTitle}>sessions</div>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>when</th>
                <th style={S.th}>pose</th>
                <th style={S.th}>phase</th>
                <th style={S.th}>grade</th>
                <th style={S.th}>top fix</th>
              </tr>
            </thead>
            <tbody>
              {[...entries].reverse().map((entry) => (
                <tr key={entry.sessionId}>
                  <td style={S.td}>{timeLabel(entry.at)}</td>
                  <td style={{ ...S.td, ...S.mono }}>{entry.poseId}</td>
                  <td style={S.td}>{phaseLabel(entry.phase)}</td>
                  <td style={{ ...S.td, ...S.mono }}>{entry.grade.toFixed(0)}</td>
                  <td style={S.td}>{entry.topFix ? entry.topFix.cue : '— clean'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={S.note}>
        fix-my-shot is an off-court scaffold for your eye — it sharpens how you read shooting
        form, alongside your real practice.
      </p>
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: {
    font: '15px/1.5 system-ui, sans-serif',
    color: '#e6e9ef',
    background: '#0d1117',
    minHeight: '100vh',
    margin: 0,
    padding: '20px 24px',
    maxWidth: 900,
  },
  head: { marginBottom: 16 },
  h1: { margin: '0 0 4px', fontSize: 22 },
  sub: { margin: 0, color: '#9aa4b2', fontSize: 14 },
  link: { color: '#6cb6ff' },
  card: {
    background: '#11161d',
    border: '1px solid #222a35',
    borderRadius: 10,
    padding: '14px 16px',
    marginBottom: 14,
  },
  cardTitle: {
    color: '#8b949e',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  empty: { margin: 0, color: '#9aa4b2' },
  fixRow: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  clusterChip: {
    background: '#1f6feb22',
    color: '#6cb6ff',
    border: '1px solid #1f6feb55',
    borderRadius: 999,
    padding: '2px 10px',
    fontSize: 12,
    fontWeight: 600,
  },
  cue: { fontSize: 15.5 },
  improved: { color: '#3fb950', margin: '10px 0 0', fontSize: 13.5 },
  stalled: { color: '#d29922', margin: '10px 0 0', fontSize: 13.5 },
  awaiting: { color: '#8b949e', margin: '10px 0 0', fontSize: 13.5 },
  trendRow: { display: 'flex', gap: 5, alignItems: 'center', marginTop: 10 },
  dotGood: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: '#3fb950',
    display: 'inline-block',
  },
  dotBad: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: '#f85149',
    display: 'inline-block',
  },
  trendLabel: { color: '#6b7480', fontSize: 12, marginLeft: 6 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  th: {
    textAlign: 'left',
    color: '#8b949e',
    fontWeight: 600,
    padding: '6px 8px',
    borderBottom: '1px solid #222a35',
  },
  td: { padding: '7px 8px', borderBottom: '1px solid #1b222c', verticalAlign: 'top' },
  mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5 },
  note: {
    color: '#6b7480',
    fontSize: 12.5,
    marginTop: 6,
    borderTop: '1px solid #1b222c',
    paddingTop: 10,
  },
};
