# fix-my-shot

> **Status: v0.1 — local deploy — is live.** The core loop ships on `main` and
> runs locally: `bin/setup && npm run dev` boots the trainer, `npm run
> verify:loop` proves the loop end-to-end (9 steps, headless), and `npm run
> spike:measure` re-checks the SPEC §11.7 perf budget on the built bundle
> (currently **GO** across the board). The milestone (issues #6–#15) is done;
> the spec of record, the decision log (ADR-0002…0010), and the scorer's
> principle baseline govern everything that landed.

## What this is

`fix-my-shot` is an off-court basketball **shot-form trainer**: it generates a
physically-real body+ball+floor **pose**, lets you fix the posture, re-grades the
**form** against a research-derived baseline of shooting principles, and reports
the ranked fixes — training **execution, not aim**; no ball flight, no make/miss
([docs/SPEC.md](docs/SPEC.md)).

![the core loop: pick a faulted pose, drag a fix, watch the form re-grade](docs/media/loop-demo.gif)

*Stills in [docs/media/](docs/media/): boot, ranked fixes on a faulted pose,
an accepted edit re-graded, the history view.*

Everything load-bearing is decided and captured:

- **[docs/SPEC.md](docs/SPEC.md)** — the spec of record (scope, scene, acceptance criteria).
- **[docs/principles-baseline.md](docs/principles-baseline.md)** — the scorer's single source of truth (phase-aware principle ranges, cross-verified).
- **[docs/decisions/](docs/decisions/)** — ADR-0002…0009 (product, engine, scoring, positioning, sport seam, stack/layout, score semantics, scene/lifecycle).
- **[docs/research/](docs/research/)** — the cross-verified evidence base and the open-source landscape.

Around the code sits a governed decision log, a records ledger, and a
machine-checkable readiness standard — the artifacts that should exist *with* the
code, not just the code itself.

### Layout

```
apps/web/            Vite + React shell (the app)
packages/core/       sport-agnostic domain — names no sport concept (ADR-0006)
packages/basketball/ the per-sport plugin: phases + principle data
packages/scoring/    phase-aware range scorer + report model (ADR-0008)
tools/posegen/       offline MJX pose pipeline (Python/JAX; not an npm workspace)
.claude/skills/run/  committed agent skill: launch, drive, and verify the app
```

## Getting started

Requires **Node ≥ 22** (see [`.nvmrc`](.nvmrc)).

1. **Install** — one documented entrypoint sets up the workspaces:
   ```bash
   bin/setup          # npm ci on a clean checkout, else npm install
   ```
2. **Run it** — the dev server serves the core loop as the default route:
   ```bash
   npm run dev        # Vite dev server (apps/web) — pick a ⚠ pose, drag, re-grade
   ```
   Deep links: `?history` (stored sittings), `?spike` (engine benchmark),
   `?editor` (alias of the loop). The MuJoCo WASM in use is the
   single-threaded build — no COOP/COEP headers, so `vite preview` or any
   static file host serves the production build as-is.
3. **Verify it** — committed checks that build and drive the real bundle:
   ```bash
   npx playwright install chromium   # once, for the headless harnesses
   npm run verify:loop    # build + 9-step end-to-end drive of the loop
   npm run spike:measure  # build + SPEC §11.7 perf budget → "VERDICT: GO"
   ```
   Agent sessions get the same via the committed
   [`run` skill](.claude/skills/run/SKILL.md) (launch + drive + verify).
4. **Develop** — the standard workspace tasks:
   ```bash
   npm test           # Vitest across all packages
   npm run typecheck  # tsc --noEmit, whole repo
   npm run lint       # eslint (incl. the ADR-0006 core→plugin import boundary)
   npm run build      # Vite production build (apps/web/dist)
   ```
5. **Orient / check readiness** — derived state and the baseline score:
   ```bash
   node "$HOME/.claude/skills/baseline/baseline.mjs" orient --repo .
   node "$HOME/.claude/skills/baseline/baseline.mjs" check  --repo .
   ```
6. **Read the definitions.** Start with [`docs/SPEC.md`](docs/SPEC.md), then the
   decisions in [`docs/decisions/`](docs/decisions/).

## How this repo is governed

This project adopts the [project-baseline](https://github.com/AdarGit008/baseline-skill)
standard: a testable readiness bar enforced by a zero-dependency checker rather
than a prose checklist. Decisions live as ADRs, session work is captured in
`records/`, and the posture is declared in `baseline.repo.json`. See the ADR
above for why, and `SECURITY.md` for how to report a vulnerability.

## License

[MIT](LICENSE) © 2026 Adar
