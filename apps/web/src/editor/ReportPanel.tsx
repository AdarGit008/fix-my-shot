// The ranked report rendered (issues #12/#14): the 0–100 form grade, the fix
// list in expert vocabulary (cluster chip + external-focus cue, top fix
// leading — never raw per-parameter numbers), per-principle rows with honest
// states (in range / flagged style / violated / not measurable on this body
// model), and the top-fix continuity line from the previous session (#13).

import type { Report } from '@fix-my-shot/core';
import { BASELINE } from '@fix-my-shot/basketball';
import type { TopFixContinuity } from '../progress/store';

function principleName(id: string): string {
  return BASELINE.find((row) => row.id === id)?.name.replace(/\*\*/g, '') ?? id;
}

function gradeColor(grade: number): string {
  if (grade >= 85) return '#3fb950';
  if (grade >= 60) return '#d29922';
  return '#f85149';
}

export function ReportPanel({
  report,
  continuity,
}: {
  report: Report;
  continuity: TopFixContinuity | null;
}) {
  const flagged = report.principleResults.filter(
    (r) => !r.satisfied && r.tier === 'style-variant',
  );
  const unmeasured = report.principleResults.filter((r) => !r.measured);
  const satisfied = report.principleResults.filter((r) => r.satisfied && r.measured);

  return (
    <div>
      <div style={S.gradeRow}>
        <span style={{ ...S.grade, color: gradeColor(report.grade) }}>
          {report.grade.toFixed(0)}
        </span>
        <span style={S.gradeLabel}>
          form grade · {report.phase}
          <br />
          <span style={S.gradeSub}>a 0–100 reading of this pose against the principle
          baseline — not a make probability</span>
        </span>
      </div>

      {continuity?.prior && (
        <div style={S.continuity}>
          {continuity.improved === true && (
            <span style={S.continuityGood}>
              ✓ last session&apos;s fix improved (+{Math.round(continuity.recoveredPoints ?? 0)}
              &nbsp;pts): <em>{continuity.prior.cue}</em>
            </span>
          )}
          {continuity.improved === false && (
            <span style={S.continuityFlat}>
              still working: <em>{continuity.prior.cue}</em>
            </span>
          )}
          {continuity.improved === null && (
            <span style={S.continuityFlat}>
              from last session: <em>{continuity.prior.cue}</em>
            </span>
          )}
        </div>
      )}

      {report.fixes.length > 0 ? (
        <div style={S.section}>
          <div style={S.sectionTitle}>fixes, highest leverage first</div>
          {report.fixes.map((fix, index) => (
            <div key={fix.principleId} style={index === 0 ? S.fixTop : S.fix}>
              <span style={S.clusterChip}>{fix.cluster}</span>
              <span style={index === 0 ? S.cueTop : S.cue}>{fix.cue}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={S.section}>
          <div style={S.allClear}>
            Nothing to fix in this phase — every measured principle reads in range.
          </div>
        </div>
      )}

      <div style={S.section}>
        <div style={S.sectionTitle}>principles in this phase</div>
        <div style={S.chips}>
          {report.principleResults
            .filter((r) => !r.satisfied && r.measured && r.tier !== 'style-variant')
            .map((r) => (
              <span key={r.principleId} style={S.chipBad} title={`~${r.atStake.toFixed(0)} pts at stake`}>
                ✗ {principleName(r.principleId)}
              </span>
            ))}
          {flagged.map((r) => (
            <span key={r.principleId} style={S.chipFlag} title="style note — never deducted">
              ⚑ {principleName(r.principleId)}
            </span>
          ))}
          {satisfied.map((r) => (
            <span key={r.principleId} style={S.chipGood}>
              ✓ {principleName(r.principleId)}
            </span>
          ))}
          {unmeasured.map((r) => (
            <span
              key={r.principleId}
              style={S.chipGhost}
              title="not measurable on this body model — reported, never deducted"
            >
              ∅ {principleName(r.principleId)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  gradeRow: { display: 'flex', gap: 14, alignItems: 'center', marginBottom: 10 },
  grade: { fontSize: 46, fontWeight: 700, lineHeight: 1 },
  gradeLabel: { color: '#9aa4b2', fontSize: 13, lineHeight: 1.45 },
  gradeSub: { color: '#6b7480', fontSize: 11.5 },
  continuity: {
    background: '#0d1117',
    border: '1px solid #1b222c',
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 12.5,
    marginBottom: 10,
  },
  continuityGood: { color: '#3fb950' },
  continuityFlat: { color: '#9aa4b2' },
  section: { marginTop: 12 },
  sectionTitle: {
    color: '#8b949e',
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  fixTop: {
    display: 'flex',
    gap: 8,
    alignItems: 'baseline',
    background: '#1f6feb18',
    border: '1px solid #1f6feb44',
    borderRadius: 8,
    padding: '8px 10px',
    marginBottom: 6,
  },
  fix: {
    display: 'flex',
    gap: 8,
    alignItems: 'baseline',
    padding: '4px 10px',
    marginBottom: 2,
  },
  clusterChip: {
    background: '#1f6feb22',
    color: '#6cb6ff',
    border: '1px solid #1f6feb55',
    borderRadius: 999,
    padding: '1px 8px',
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  cueTop: { fontSize: 14.5, fontWeight: 600 },
  cue: { fontSize: 13, color: '#b8c2cc' },
  allClear: { color: '#3fb950', fontSize: 13.5 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 5 },
  chipBad: {
    background: '#f8514915',
    color: '#f0a0a0',
    border: '1px solid #f8514940',
    borderRadius: 999,
    padding: '2px 9px',
    fontSize: 11.5,
  },
  chipFlag: {
    background: '#d2992215',
    color: '#e3b341',
    border: '1px solid #d2992240',
    borderRadius: 999,
    padding: '2px 9px',
    fontSize: 11.5,
  },
  chipGood: {
    background: '#3fb95012',
    color: '#7ee2a8',
    border: '1px solid #3fb95035',
    borderRadius: 999,
    padding: '2px 9px',
    fontSize: 11.5,
  },
  chipGhost: {
    background: 'transparent',
    color: '#6b7480',
    border: '1px dashed #30363d',
    borderRadius: 999,
    padding: '2px 9px',
    fontSize: 11.5,
  },
};
