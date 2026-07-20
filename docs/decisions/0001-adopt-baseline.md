# ADR-0001 — Adopt the project-baseline standard as repo infrastructure

Status: Accepted
Supersedes: none
Superseded-by: none
Date: 2026-07-20

## Context

`fix-my-shot` is a brand-new repository in its ideation / definitions phase:
the product scope and stack are not yet decided, and no application code
exists. Before writing code, we want the repository's *data* — its decisions,
records, and quality posture — to be verifiable by a machine rather than
promised in prose. The author maintains the
[project-baseline](https://github.com/AdarGit008/baseline-skill) standard (90
rules, a zero-dependency checker), so "infra first" means adopting it here.

## Decision

Adopt project-baseline as this repo's readiness standard, with the following
posture recorded in `baseline.repo.json`:

- **`type: docs`** — the repo currently holds definitions/docs, no code. This
  scopes out the 28 build/test rules and 6 OPS rules that check code artifacts
  that do not exist yet, while keeping the ~55 governance, records, security,
  and context rules that apply to what we *are* producing. **When code lands,
  this ADR is superseded by one that flips `type` to the real stack** (`node` /
  `python` / `service` / `library`) in the same PR that introduces the code.
- **`workflow: multi-lane`, `anchoring: strict`** — the V2 default: parallel
  agent lanes with 7-day leases, work anchored to issues.
- **`lifecycle: experimental`, `maturity: prototype`** — matches the phase;
  CLAIM-* rules stay dormant until `maturity: claimed`.
- **License: MIT** — permissive open source, consistent with the baseline-skill
  repo.

Infrastructure wired: a SessionStart `orient` hook (`.claude/settings.json`, repo
-scoped) and a committed pre-push secret-scrub hook (`hooks/scrub-pre-push.sh`).

## Consequences

- **Easy:** every session opens with a derived-state survey; readiness is an
  exit code, not a checklist; secrets are scanned before they leave the machine.
- **Deferred honestly:** `SEC-05` (dependency-update bot) stays a WARN — there
  are zero dependencies to update; wiring Dependabot now would be presence
  theater. It activates when a manifest lands.
- **Cost:** the docs-first posture is a temporary scaffold. The `type: docs`
  decision must be revisited (and this ADR superseded) the moment real code is
  added, or the build/test rules will stay wrongly dormant.
