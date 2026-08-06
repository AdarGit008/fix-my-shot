---
name: run
description: Launch fix-my-shot locally (dev server or built bundle), drive the core loop end-to-end, and verify it headless. Use when asked to run, start, demo, or screenshot the app, or to confirm a change works in the real app rather than just in tests.
---

# Run fix-my-shot

The app is the **core loop** — generate a pose, fix the posture, watch the form
re-grade into ranked fixes. It ships as a static Vite bundle; the MuJoCo WASM
is the **single-threaded** official build, so no SharedArrayBuffer and **no
COOP/COEP headers** are needed in dev, preview, or on any static host.

## Launch

Dev server (instant feedback, serves `apps/web` on Vite's default port):

```bash
npm run dev
```

Production bundle (what a deploy serves — build once, then preview):

```bash
npm run build
cd apps/web && npx vite preview   # serves dist/ — add --port N --strictPort to pin
```

A fresh clone needs `bin/setup` (or `npm i`) first; Node ≥ 22 (`.nvmrc`).

## Routes

| Route | What it is |
| --- | --- |
| `/` | the core loop (default route — the product) |
| `/?editor` | alias of the loop page |
| `/?history` | stored sittings from localStorage, read-only |
| `/?spike` | engine benchmark page; publishes `window.__SPIKE_RESULTS__` |

## Drive the loop (manually or via browser automation)

1. Pick a pose in the `#pose-select` dropdown. Names with ⚠ carry injected
   form faults — `dip-unloaded-straight-knee-00` is a good demo pick.
2. The report panel (`form grade`, "fixes, highest leverage first") renders on
   load and after every accepted edit.
3. Drag a limb or the ball on the canvas, then release. The verdict line says
   `edit accepted` (gate passed → deterministic re-grade, report updates) or
   `edit rejected` (pose reverts). Empty-space drags orbit; scroll zooms.
4. An accepted edit **engages** the sitting — only engaged sittings record to
   history/continuity. Reload and re-engage, then `/?history` lists both.

## Verify headless (the committed checks)

```bash
npx playwright install chromium   # once per machine
npm run verify:loop               # builds, then 9-step E2E → "VERIFY: PASS (9 steps)"
npm run spike:measure             # builds, then perf vs SPEC §11.7 → "VERDICT: GO"
```

`verify:loop` (`tools/loop-verify.mjs`) drives boot → grade-on-load → faulted
pose → accepted edit → continuity across a reload → history, and fails on any
page/console error. `spike:measure` re-checks the budget (initial load ≤ 5 s,
re-grade + report ≤ 100 ms, drag ≥ 30 fps) against the production build and
takes an optional JSON output path argument.

Gotchas: both harnesses serve `apps/web/dist` themselves (`vite preview`) on
strict ports — verify uses `LOOP_PORT` (default 4190), spike uses `SPIKE_PORT`
(default 4188); kill stale previews if a port is taken. Headless Chromium
renders via SwiftShader (software GL), so measured fps is a conservative floor
for real hardware.
