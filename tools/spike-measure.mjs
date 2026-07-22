// Headless measurement harness for the engine spike (issue #6).
//
// Serves the *production* web build with `vite preview`, opens ?spike in a
// headless Chromium, waits for the page to publish window.__SPIKE_RESULTS__, and
// prints the go/no-go JSON. Run via `npm run spike:measure` (which builds first).
//
// Requires the web build to exist (apps/web/dist) and Playwright's chromium
// (`npx playwright install chromium`). Headless renders via software GL
// (SwiftShader), so the drag fps here is a conservative floor for real hardware.

import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webDir = resolve(repoRoot, 'apps/web');
const PORT = Number(process.env.SPIKE_PORT ?? 4188);
const OUT = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : null;

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

let browser;
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
  const page = await browser.newPage();
  page.on('console', (m) => console.error(`[page:${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => console.error(`[pageerror] ${e.message}`));

  await page.goto(`http://127.0.0.1:${PORT}/?spike`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.__SPIKE_RESULTS__ || window.__SPIKE_ERROR__, {
    timeout: 60000,
  });

  const err = await page.evaluate(() => window.__SPIKE_ERROR__);
  if (err) throw new Error(`page reported: ${err}`);

  const results = await page.evaluate(() => window.__SPIKE_RESULTS__);
  const json = JSON.stringify(results, null, 2);
  console.log(json);
  if (OUT) {
    writeFileSync(OUT, json + '\n');
    console.error(`\nwrote ${OUT}`);
  }
  console.error(`\nVERDICT: ${results.verdict.overall}`);
  process.exitCode = results.verdict.overall === 'GO' ? 0 : 2;
} catch (e) {
  console.error('spike-measure failed:', e.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  preview.kill('SIGTERM');
}
