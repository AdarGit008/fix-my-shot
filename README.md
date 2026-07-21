# fix-my-shot

> **Status: product DEFINED, pre-build.** The spec of record, the decision log
> (ADR-0002…0009), and the scorer's principle baseline are merged to `main`.
> There is no application code **yet** — the next step is build kickoff, at which
> point the repo's `type` flips from `docs` to the real stack in the first-code PR
> (per [ADR-0001](docs/decisions/0001-adopt-baseline.md)).

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

The repo is still deliberately docs-first: a governed decision log, a records
ledger, and a machine-checkable readiness standard — the artifacts that *should*
exist before code.

## Getting started

There is nothing to install or run yet. To work in this repo today:

1. **Orient.** See where things stand — decisions, open work, records:
   ```bash
   node "$HOME/.claude/skills/baseline/baseline.mjs" orient --repo .
   ```
2. **Check readiness.** Score the repo against the baseline standard:
   ```bash
   node "$HOME/.claude/skills/baseline/check.mjs" --repo .
   ```
3. **Read the definitions.** Start with [`docs/SPEC.md`](docs/SPEC.md), then the
   decisions from [`docs/decisions/0001-adopt-baseline.md`](docs/decisions/0001-adopt-baseline.md).

## How this repo is governed

This project adopts the [project-baseline](https://github.com/AdarGit008/baseline-skill)
standard: a testable readiness bar enforced by a zero-dependency checker rather
than a prose checklist. Decisions live as ADRs, session work is captured in
`records/`, and the posture is declared in `baseline.repo.json`. See the ADR
above for why, and `SECURITY.md` for how to report a vulnerability.

## License

[MIT](LICENSE) © 2026 Adar
