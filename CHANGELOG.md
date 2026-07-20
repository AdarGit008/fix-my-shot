# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it cuts a
release.

## [Unreleased]

### Added
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

[Unreleased]: https://github.com/AdarGit008/fix-my-shot/commits/main
