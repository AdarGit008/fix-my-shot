# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it cuts a
release.

## [Unreleased]

### Added
- **Monorepo scaffold — first code** (2026-07-21, issue #5): the TypeScript + Vite +
  npm-workspaces monorepo per [ADR-0007](docs/decisions/0007-app-stack-and-layout.md) —
  `apps/web` (Vite + React shell), `packages/{core,basketball,scoring}` (the ADR-0006
  seam made physical, with a red-on-arrival guard keeping `core` sport-agnostic), and the
  `tools/posegen` Python skeleton. Root toolchain (TypeScript strict, ESLint incl. the
  core→plugin import boundary, Prettier, Vitest), a `ci` workflow (lint · typecheck ·
  test · build · SHA-pinned baseline check), plus `.env.example`, `.nvmrc`, and `bin/setup`.
- **Build-kickoff decision records** (2026-07-21): [ADR-0007](docs/decisions/0007-app-stack-and-layout.md)
  (TypeScript + React + three.js + Vite monorepo; `@mujoco/mujoco` runtime; package
  seam; MJX pose pipeline; minimal persistence), [ADR-0008](docs/decisions/0008-score-semantics.md)
  (0–100 form grade — not a probability; gate + weighted deductions; interactive
  finite-difference leverage with MJX as the offline oracle), and
  [ADR-0009](docs/decisions/0009-scene-pose-lifecycle-gate.md) (virtual target;
  MJX pose library + fault injection; phase labeled-at-generation with bounded
  editing; the physical-validity gate; report structure).
- **Principles baseline** ([docs/principles-baseline.md](docs/principles-baseline.md)),
  the phase-aware form scorer instantiating [ADR-0004](docs/decisions/0004-scoring-model.md):
  5-phase taxonomy, tiered per-phase principle ranges, honest excluded list, and a
  static **produced-backspin** proxy in place of an in-flight spin rate.
- **Open-source landscape** ([docs/research/oss-landscape.md](docs/research/oss-landscape.md)):
  13 repos deep-read across (a) form grading, (b) shot simulation, (c) reusable
  physics/pose/IK code — a sanity check (nobody grades an editable simulated pose)
  and the code-reuse shortlist for the engine/gate build.
- Governance hardening ahead of first code (2026-07-21, founder-approved):
  Dependabot config (`.github/dependabot.yml`, activates as manifests land) and
  a `main` branch ruleset (PRs required, force-push blocked, conversation
  resolution) — see the dated amendment in
  [ADR-0001](docs/decisions/0001-adopt-baseline.md).
- **Spec of record** for the fix-my-shot product concept
  ([docs/SPEC.md](docs/SPEC.md)) with explicit acceptance criteria, backed by
  decision records [ADR-0002](docs/decisions/0002-product-definition.md)…[ADR-0006](docs/decisions/0006-sport-agnostic-seam.md)
  and a cross-verified research evidence base ([docs/research/evidence.md](docs/research/evidence.md)).
  Core reframe: grade a shooting-form **pose** (any phase) against research-derived
  principle-ranges — training **execution, not aim** — on a physically-real
  body+ball+floor; no ball-trajectory or make/miss simulation.
- Adopted the [project-baseline](https://github.com/AdarGit008/baseline-skill)
  readiness standard (`baseline.repo.json`, `type: docs`, multi-lane workflow) —
  see [ADR-0001](docs/decisions/0001-adopt-baseline.md).
- Project scaffolding: `LICENSE` (MIT), `README.md`, `SECURITY.md`, `CODEOWNERS`,
  `baseline.config.json`, and a `records/` ledger.
- Baseline infrastructure: SessionStart `orient` hook (`.claude/settings.json`)
  and a committed pre-push secret-scrub hook (`hooks/scrub-pre-push.sh`).

### Changed
- **Flipped `baseline.repo.json` `type: docs → node`** in the same PR as first code
  (issue #5): the build, test, reproducibility, and lint baseline rules are now live.
  [ADR-0007](docs/decisions/0007-app-stack-and-layout.md) now supersedes
  [ADR-0001](docs/decisions/0001-adopt-baseline.md)'s `type: docs` posture clause; the
  descriptor change carries its DESC-03 judgment in this PR.
- Closed the issue-#3 numeric gaps in the principles baseline (research batch 4,
  cross-verified): pinned ranges (elbow flare, stance-width stature-normalization),
  static proxies (wrist-cock direction, load presence/coherence/symmetry,
  guide-hand, produced-backspin), and honest deferrals (wrist-release-flexion
  angle, set-elbow band, heel-off boundary, ball-to-palm gap in units).
- Re-verification pass on the evidence base: three claims downgraded CONFIRMED →
  PARTIAL and corrected in place (contact-artifact localization, "competitors"
  framing, self-controlled-feedback scope); dropped several false-precision
  baseline numbers (shoulder 59.7–85.3°, head ±15°, head-tilt 10–15°, hip 160°
  upper bound).
- Reconciled cross-document drift for build kickoff: SPEC and ADR-0002/0003/0004
  updated to the derived baseline, the 5-phase taxonomy, the 0–100 grade, and the
  virtual target; README/SECURITY moved from "ideation" to "defined, pre-build".
- Re-evaluated the CTX-04 sign-off ([JDG-0002](records/judgments/JDG-0002.json)):
  its trigger fired (the consolidated spec now exists), superseding the JDG-0001
  ideation-phase waiver.

[Unreleased]: https://github.com/AdarGit008/fix-my-shot/commits/main
