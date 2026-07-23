import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BASELINE, PHASES } from '@fix-my-shot/basketball';

// Drift guard (issue #7 Done-when): the basketball baseline data must round-trip against
// docs/principles-baseline.md. This parses the doc's phase-taxonomy table and the five
// per-phase principle tables, then asserts the transcribed BASELINE mirrors them cell-for-
// cell (name / range / tier / reading) in order. Edit the doc or the data out of step and
// this goes red — the doc stays the single source of truth (ADR-0004).

const DOC = fileURLToPath(new URL('../docs/principles-baseline.md', import.meta.url));

interface DocRow {
  readonly name: string;
  readonly range: string;
  readonly tierText: string;
  readonly readFrom: string;
}

function docLines(): string[] {
  return readFileSync(DOC, 'utf8').split('\n');
}

/** Split a markdown table row `| a | b | c |` into trimmed cells. */
function splitCells(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return inner.split('|').map((cell) => cell.trim());
}

function isTableRow(line: string): boolean {
  return line.trim().startsWith('|');
}

function isSeparatorRow(line: string): boolean {
  return splitCells(line).every((cell) => /^:?-+:?$/.test(cell));
}

/** Strip markdown bold markers so a cell compares as plain text. */
function stripBold(text: string): string {
  return text.replace(/\*\*/g, '');
}

function sectionStart(lines: string[], headingPrefix: string): number {
  const index = lines.findIndex((line) => line.startsWith(headingPrefix));
  if (index < 0) {
    throw new Error(`heading not found: ${headingPrefix}`);
  }
  return index;
}

/** The phase labels from the `## Phase taxonomy` table, in order. */
function taxonomyLabels(lines: string[]): string[] {
  const start = sectionStart(lines, '## Phase taxonomy');
  const labels: string[] = [];
  let seenHeader = false;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.startsWith('## ')) break;
    if (!isTableRow(line) || isSeparatorRow(line)) continue;
    if (!seenHeader) {
      seenHeader = true;
      continue;
    }
    const cells = splitCells(line);
    labels.push(stripBold(cells[1] ?? '').trim());
  }
  return labels;
}

/** The rows of each per-phase principle table, in phase order. */
function principleRowsByPhase(lines: string[]): DocRow[][] {
  const start = sectionStart(lines, '## Principles by phase');
  const phases: DocRow[][] = [];
  let current: DocRow[] | null = null;
  let seenHeader = false;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.startsWith('## ')) break;
    if (line.startsWith('### ')) {
      current = [];
      phases.push(current);
      seenHeader = false;
      continue;
    }
    if (current === null || !isTableRow(line) || isSeparatorRow(line)) continue;
    if (!seenHeader) {
      seenHeader = true;
      continue;
    }
    const cells = splitCells(line);
    current.push({
      name: cells[0] ?? '',
      range: cells[1] ?? '',
      tierText: cells[2] ?? '',
      readFrom: cells[3] ?? '',
    });
  }
  return phases;
}

/** The base tier token parsed from a verbatim Tier cell. */
function baseTier(tierText: string): string {
  const plain = stripBold(tierText).trim();
  if (plain.startsWith('*(')) return 'deferred';
  return (plain.split(' *(')[0] ?? plain).trim();
}

describe('principle baseline round-trips against docs/principles-baseline.md (drift guard)', () => {
  const lines = docLines();

  it('phase labels + order match the doc taxonomy', () => {
    const labels = taxonomyLabels(lines);
    expect(PHASES).toHaveLength(labels.length);
    expect(PHASES.every((phase, i) => phase.index === i)).toBe(true);
    expect(PHASES.map((phase) => phase.label)).toEqual(labels);
  });

  it('every phase table round-trips cell-for-cell, in order', () => {
    const docPhases = principleRowsByPhase(lines);
    expect(docPhases).toHaveLength(PHASES.length);

    PHASES.forEach((phase, phaseIndex) => {
      const docRows = docPhases[phaseIndex] ?? [];
      const dataRows: DocRow[] = BASELINE.filter((p) => p.phase === phase.id).map((p) => ({
        name: p.name,
        range: p.range,
        tierText: p.tierText,
        readFrom: p.readFrom,
      }));
      expect(dataRows, `phase ${phase.id} (${phase.label})`).toEqual(docRows);
    });
  });

  it('every transcribed tier is consistent with its verbatim Tier cell', () => {
    for (const principle of BASELINE) {
      expect(baseTier(principle.tierText), `tier for '${principle.id}'`).toBe(principle.tier);
    }
  });
});
