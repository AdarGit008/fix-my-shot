# fix-my-shot

> **Status: build kickoff — first code has landed.** The spec of record, the
> decision log (ADR-0002…0009), and the scorer's principle baseline are on `main`.
> The TypeScript monorepo scaffold is up and the repo's `type` has flipped
> `docs → node` (issue #5, per [ADR-0007](docs/decisions/0007-app-stack-and-layout.md)
> superseding [ADR-0001](docs/decisions/0001-adopt-baseline.md)'s posture clause), so
> the build/test readiness rules are now live. Feature work follows the **v0.1 —
> local deploy** milestone (issues #6–#15).

## What this is

`fix-my-shot` is an off-court basketball **shot-form trainer**: it generates a
physically-real body+ball+floor **pose**, lets you fix the posture, re-grades the
**form** against a research-derived baseline of shooting principles, and reports
the ranked fixes — training **execution, not aim**; no ball flight, no make/miss
([docs/SPEC.md](docs/SPEC.md)). Everything load-bearing is decided and captured:

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
```

## Getting started

Requires **Node ≥ 22** (see [`.nvmrc`](.nvmrc)).

1. **Install** — one documented entrypoint sets up the workspaces:
   ```bash
   bin/setup          # npm ci on a clean checkout, else npm install
   ```
2. **Develop** — the standard workspace tasks:
   ```bash
   npm run dev        # Vite dev server (apps/web)
   npm test           # Vitest across all packages
   npm run typecheck  # tsc --noEmit, whole repo
   npm run lint       # eslint (incl. the ADR-0006 core→plugin import boundary)
   npm run build      # Vite production build
   ```
3. **Orient / check readiness** — derived state and the baseline score:
   ```bash
   node "$HOME/.claude/skills/baseline/baseline.mjs" orient --repo .
   node "$HOME/.claude/skills/baseline/baseline.mjs" check  --repo .
   ```
4. **Read the definitions.** Start with [`docs/SPEC.md`](docs/SPEC.md), then the
   decisions in [`docs/decisions/`](docs/decisions/).

## How this repo is governed

This project adopts the [project-baseline](https://github.com/AdarGit008/baseline-skill)
standard: a testable readiness bar enforced by a zero-dependency checker rather
than a prose checklist. Decisions live as ADRs, session work is captured in
`records/`, and the posture is declared in `baseline.repo.json`. See the ADR
above for why, and `SECURITY.md` for how to report a vulnerability.

## License

[MIT](LICENSE) © 2026 Adar
