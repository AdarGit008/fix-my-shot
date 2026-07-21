import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// TEST-03 — red-on-arrival guard for the ADR-0006 seam: packages/core must name no
// sport-specific concept. If any of these tokens ever appears in core's source, this
// test fails (the "must never exist" invariant). Sport vocabulary belongs in the
// per-sport plugins (e.g. @fix-my-shot/basketball), never in core. This guard lives
// outside packages/core so its own token list can't trip it.
const FORBIDDEN = [
  'basketball',
  'hoop',
  'basket',
  'rim',
  'backboard',
  'dribble',
  'layup',
  'freethrow',
  'free-throw',
  'jumpshot',
  'jump-shot',
  'swish',
  'ball',
];

const CORE_SRC = fileURLToPath(new URL('../packages/core/src', import.meta.url));

function coreSourceFiles(): string[] {
  return readdirSync(CORE_SRC, { recursive: true })
    .map((entry) => String(entry))
    .filter((file) => file.endsWith('.ts'))
    .map((file) => join(CORE_SRC, file));
}

describe('ADR-0006 seam: packages/core is sport-agnostic', () => {
  it('has core source to scan', () => {
    expect(coreSourceFiles().length).toBeGreaterThan(0);
  });

  it.each(FORBIDDEN)('core source names no sport term: %s', (term) => {
    const pattern = new RegExp(`\\b${term}\\b`, 'i');
    const offenders = coreSourceFiles().filter((file) => pattern.test(readFileSync(file, 'utf8')));
    expect(offenders, `sport term "${term}" found in core`).toEqual([]);
  });

  it('core imports no sport plugin', () => {
    const importPattern = /from\s+['"]@fix-my-shot\/basketball/;
    const offenders = coreSourceFiles().filter((file) =>
      importPattern.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
