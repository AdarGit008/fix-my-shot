// End-to-end verify flow for the core loop (issue #14): serves the production
// build, then drives generate → edit → re-grade → report → persistence in a
// headless Chromium across TWO sittings — the second must show the first's
// top-fix continuity, and ?history must list the sessions. Run via
// `npm run verify:loop` (which builds first). Requires Playwright's chromium
// (`npx playwright install chromium`).

import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webDir = resolve(repoRoot, 'apps/web');
const PORT = Number(process.env.LOOP_PORT ?? 4190);
const FAULTED_POSE = 'dip-unloaded-straight-knee-00';

if (!existsSync(resolve(webDir, 'dist/index.html'))) {
  console.error('No build found at apps/web/dist. Run: npm run build --workspace @fix-my-shot/web');
  process.exit(1);
}

function waitForPort(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((res, rej) => {
    const tryOnce = () => {
      const sock = createConnection({ port, host: '127.0.0.1' }, () => {
        sock.end();
        res();
      });
      sock.on('error', () => {
        sock.destroy();
        if (Date.now() > deadline) rej(new Error(`preview server never came up on :${port}`));
        else setTimeout(tryOnce, 200);
      });
    };
    tryOnce();
  });
}

const preview = spawn(
  'npx',
  ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
  { cwd: webDir, stdio: 'ignore' },
);

const steps = [];
function step(name, ok, detail = '') {
  steps.push({ name, ok });
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) throw new Error(`verify step failed: ${name}`);
}

let browser;
const problems = [];
try {
  await waitForPort(PORT);
  browser = await chromium.launch({
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`[console:error] ${m.text()}`);
  });

  // ── Sitting 1: generate → report → edit → re-grade ──────────────────────
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('#pose-select', { timeout: 60000 });
  step('loop boots on the default route (pose picker present)', true);

  await page.waitForSelector('text=form grade', { timeout: 20000 });
  step('the starting pose is graded on load (report panel renders)', true);

  await page.selectOption('#pose-select', FAULTED_POSE);
  await page.waitForTimeout(600);
  const topFixVisible = (await page.locator('text=fixes, highest leverage first').count()) > 0;
  step('a faulted pose reports ranked fixes', topFixVisible);
  const gradeBefore = Number(
    await page.locator('span').filter({ hasText: /^\d+$/ }).first().innerText(),
  );
  step('grade reads as a number', Number.isFinite(gradeBefore), `grade ${gradeBefore}`);

  // Drive drags across a grid until one is accepted (the re-grade step).
  async function dragUntilAccepted() {
    const canvas = await page.locator('canvas').boundingBox();
    for (const fy of [0.3, 0.4, 0.5, 0.6, 0.7]) {
      for (const fx of [0.35, 0.45, 0.5, 0.55, 0.65]) {
        const sx = canvas.x + canvas.width * fx;
        const sy = canvas.y + canvas.height * fy;
        await page.mouse.move(sx, sy);
        await page.mouse.down();
        for (let i = 1; i <= 6; i++) {
          await page.mouse.move(sx + i * 4, sy - i * 3);
          await page.waitForTimeout(25);
        }
        await page.mouse.up();
        await page.waitForTimeout(300);
        const verdicts = page.locator('span').filter({ hasText: /edit (accepted|rejected)/ });
        if ((await verdicts.count()) > 0) {
          const text = await verdicts.first().innerText();
          if (text.includes('accepted')) return true;
        }
      }
    }
    return false;
  }
  step('an edit is accepted by the gate and re-graded', await dragUntilAccepted());

  // ── Sitting 2: persistence carries the top fix across a reload ──────────
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#pose-select', { timeout: 60000 });
  await page.selectOption('#pose-select', FAULTED_POSE);
  await page.waitForTimeout(600);
  const continuity =
    (await page.locator("text=/last session|still working/").count()) > 0;
  step('the second sitting shows the prior top fix (continuity from localStorage)', continuity);

  // Engage sitting 2 as well, so history carries both sittings (an un-edited
  // sitting deliberately never records).
  step('a second-sitting edit is accepted and recorded', await dragUntilAccepted());

  // ── History view reads storage alone ────────────────────────────────────
  await page.goto(`http://127.0.0.1:${PORT}/?history`, { waitUntil: 'load' });
  await page.waitForSelector('text=sessions', { timeout: 20000 });
  const rows = await page.locator('tbody tr').count();
  step('the history view lists the recorded sittings', rows >= 2, `${rows} sessions`);

  const hardProblems = problems.filter((p) => !p.includes('favicon'));
  step('no page/console errors across the whole flow', hardProblems.length === 0);

  console.log(`\nVERIFY: PASS (${steps.length} steps)`);
} catch (e) {
  console.error(`\nVERIFY: FAIL — ${e.message}`);
  for (const p of problems) console.error(p);
  process.exitCode = 1;
} finally {
  await browser?.close();
  preview.kill('SIGTERM');
}
