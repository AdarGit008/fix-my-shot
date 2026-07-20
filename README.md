# fix-my-shot

> **Status: ideation / definitions phase.** The name is a placeholder and the
> scope is still being defined. There is no application code yet — this repo
> currently holds the project's definitions, decisions, and quality
> infrastructure. Product code will land once the concept is nailed down.

## What this is

`fix-my-shot` is an early-stage project in its definitions phase. Right now the
repository is deliberately docs-first: the artifacts that exist are the ones
that *should* exist before code — a governed decision log, a records ledger,
and a readiness standard that a machine can check. When the product shape is
decided it will be captured in an ADR under [`docs/decisions/`](docs/decisions/)
and the repo's `type` will flip from `docs` to the real stack.

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
3. **Read the decisions.** Start with
   [`docs/decisions/0001-adopt-baseline.md`](docs/decisions/0001-adopt-baseline.md).

## How this repo is governed

This project adopts the [project-baseline](https://github.com/AdarGit008/baseline-skill)
standard: a testable readiness bar enforced by a zero-dependency checker rather
than a prose checklist. Decisions live as ADRs, session work is captured in
`records/`, and the posture is declared in `baseline.repo.json`. See the ADR
above for why, and `SECURITY.md` for how to report a vulnerability.

## License

[MIT](LICENSE) © 2026 Adar
