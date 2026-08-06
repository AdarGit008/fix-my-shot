# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it cuts a
release.

## [Unreleased]

### Added
- **Local deploy** (2026-08-06, issue #15): v0.1's finish line. The README
  "Getting started" now runs the real thing (dev server → the loop, verify,
  build/preview), a committed agent skill (`.claude/skills/run/SKILL.md`)
  packages launch/drive/verify for future sessions, and demo media landed in
  `docs/media/` (a 9 s loop GIF + four stills, captured off the production
  bundle by a Playwright drive). The SPEC §11.7 perf budget was re-confirmed
  on the deployed bundle after the whole v0.1 stack merged: initial load
  **309 ms** (≤ 5 s), re-grade+report **p95 0.2 ms** (≤ 100 ms), drag **60 fps
  observed / ~1430 fps CPU capacity** (≥ 30 fps) — **GO**. No COOP/COEP
  headers anywhere: the MuJoCo WASM in use is the single-threaded build, so
  any static host serves `apps/web/dist` as-is.
- **The core loop, wired** (2026-08-06, issue #14): the default route IS the
  product — pick a phase-labelled pose from the generated library (body + ball +
  floor + the virtual target, now rendered as a rim ring + stanchion at the
  ADR-0009 free-throw geometry), fix the posture behind the gate, and the form
  re-grades deterministically on every accepted edit into the ranked report
  (`ReportPanel`: 0–100 grade with not-a-probability framing, fixes in
  external-focus vocabulary with the top fix leading, per-principle chips with
  honest states incl. unmeasurable, live top-fix continuity from the previous
  sitting). Sittings record to the #13 progress store **once engaged** (first
  accepted edit) — drive-by pose loads never pollute history or continuity — a
  semantics the new end-to-end verify flow surfaced and
  `continuityAgainstReport` implements (last stored sitting vs the live
  report). All product copy uses scaffold framing; no efficacy/transfer claims
  (acceptance #8). **`npm run verify:loop`** (`tools/loop-verify.mjs`) drives
  the whole loop headless across two sittings: boot → grade on load → faulted
  pose reports fixes → accepted edit re-grades → reload → continuity from
  localStorage → second sitting edits → history lists both — 9 steps, console
  clean. SPEC §11 acceptance criteria 1–9 run as a checklist in the lane
  record: all pass (the mid-range reference-machine residual from #6 stands).
- **Minimal persistence** (2026-08-06, issue #13): the smallest real progression
  loop (ADR-0007) — localStorage-only session history with the two derived
  signals the moat needs. `apps/web/src/progress/store.ts`: versioned,
  corruption-graceful, capped store behind an injected Storage interface (a
  "session" is one loaded pose being worked on; re-grades upsert one line per
  sitting); `entryFromReport` captures pose/phase/grade/per-principle results/
  top fix; `principleTrend` gives the across-sessions series for any principle;
  `topFixContinuity` remembers the prior session's top fix and answers whether
  it improved (satisfied now, or points-at-stake recovered) — including the
  honest `null` when no later session re-measures that phase. The `?history`
  view renders continuity ("pick up where you left off", the fix in its own
  external-focus words), a session table, and a per-session trend strip, and
  reads storage alone. Recording is wired into the core loop by issue #14.
  Done-when held by an engine-backed test: two real sessions (faulted dip →
  fixed dip) through the store yield the prior top fix, improved = true with
  the recovered points, and the trend — from storage alone. 12 new tests.
- **Leverage + ranked report** (2026-08-06, issue #12): the report that is the
  product — `buildReport` returns the ADR-0008 grade plus a leverage-ranked,
  stability-gated fix list in expert vocabulary. Interactive **finite-difference
  leverage** on the analytic score (no gradient engine on the interactive path):
  each fix's rank composes the points its principle is holding down (the new
  per-principle `atStake` — stone ceiling loss / guideline deduction, so a
  binary-proxy fault with no local slope still ranks by its real stake) with the
  FD sensitivity of that stake to one step of the most effective editable
  parameter (±1.5° joints / ±2 cm ball, phase-clamped, re-grounded; stability
  contexts pass the full gate). The **stability gate** (SPEC acceptance #5)
  recomputes the ranking under seeded feasible micro-jitters, suppresses any fix
  whose rank ranges wider than one position, and orders survivors by median
  leverage — near-identical poses return the same top fix, held by test across
  every faulted library pose. Fixes are grouped into the four **BEEF-style
  clusters** and phrased from a per-principle **external-focus cue table**
  (`packages/basketball/src/cues.ts`) — target/ball/arc/floor language enforced
  by test (an unsanctioned cue may name no anatomy; 4 rows record their
  sanctioned wording per ADR-0009). The **report JSON schema** ships at
  `packages/core/schema/report.schema.json`, validated against every produced
  report. Measured: ~13 ms per full report (3 fixes), ~1 ms clean — 8× inside
  the SPEC §11.7 budget. 20 new tests.
- **Phase-aware range scorer** (2026-08-06, issue #11): the scorer proper — a real
  measurement layer + the ADR-0008 aggregation, replacing issue #7's reference
  stub. Sport-agnostic geometry primitives and a `PoseSnapshot` world-reading
  seam land in `@fix-my-shot/core`/`scoring` (3-point joint angles,
  segment-vs-gravity, COM-in-support projection, target-plane offsets); the
  basketball plugin gains its measurement recipe book
  (`packages/basketball/src/measure.ts`) reading every measured principle off a
  snapshot, with model honesty built in — wrist principles and cross-session
  repeatability return *unmeasured* (reported, never deducted, never a fix)
  because the humanoid has no wrist DOF and one frame has no history. Aggregation
  semantics per ADR-0008 with smooth penalty curves (a broken written-in-stone
  caps the grade at 25–60 falling with violation depth; guideline bands deduct
  band-width-normalized with a live gradient for #12's leverage; failed
  style-variants are FLAGGED at zero deduction). The engine adapter
  (`apps/web/src/measure/`) reads snapshots off MuJoCo (landmarks, world COM incl.
  ball — gate parity, support polygon, contact flags, stature) and `gradeQpos`
  wires the whole seam. Every engineering threshold is calibrated against the
  shipped library and documented as such: all 5 clean poses grade ≥ 95.9 with no
  stone broken, **all 26 fault-injected poses read their injected principle**
  (stones cap to 29.9–37.9), determinism and SPEC acceptance #3 (in-range style
  never penalized) held by tests. 46 new tests.
- **Pose editor** (2026-08-06, issue #10): the user-facing edit step of the core
  loop — pick a phase-labelled library pose at `?editor`, drag joints or the ball,
  and the pose visibly cannot leave its phase or physical validity. The ADR-0009
  editable subset + per-parameter phase bounds land as basketball plugin data
  (`packages/basketball/src/bounds.ts`: 21 hinge windows + ball height band +
  ball↔hand tether per phase, envelope-tested against the whole shipped library);
  the editor composes them into the gate through `createGate`'s intended seam as
  hard QP rows (`PhaseBoundLimit`, `BallTetherLimit`, plus editor collision pairs
  — added after the projection was caught converging into authority-rejected
  penetration when a drag swung the guide hand into the parked ball, which made
  two shipped poses uneditable). Drag lifecycle in a DOM-free `EditorSession`
  (live preview → one authoritative anchor→target projection → commit or
  reject-and-revert with a named diagnosis, undo/reset), a React page wiring
  pointers + verdict UX, and [ADR-0010](docs/decisions/0010-drag-preview-incremental-projection.md):
  the drag preview is the gate's own incremental projection (measured avg 0.98 ms
  · p95 1.7 ms per pointer frame) instead of ADR-0009's CCDIKSolver bone-mirror.
  40 new tests, including the product invariant that EVERY shipped library pose
  accepts an in-phase nudge; verified end-to-end in a headless browser
  (boot → faulted pose → accepted drag → undo armed, console clean).
- **Physical-validity gate** (2026-07-28, issue #9): TypeScript port of
  [kevinzakka/mink](https://github.com/kevinzakka/mink)'s differential-IK QP
  formulation (pinned `44c8a6a`, Apache-2.0 attribution in-file) against the
  `@mujoco/mujoco` WASM API, in `apps/web/src/gate/` — the ADR-0009 realizability
  guard. Two layers: a static three-check authority classifier in lockstep with
  `tools/posegen/gate.py` (joint limits ±0.5°, COM-in-support, penetration ≤ 5 mm;
  all 33 shipped library poses re-validate from stored qpos), and a projection
  engine (frame/posture/CoM tasks, joint-limit + COM-support + collision
  inequalities, a Goldfarb–Idnani dense QP solver) with reject-and-revert — an
  invalid pose is never scored. Correctness: cross-language golden oracles
  generated by executing pinned mink on this project's scene and poses
  (`apps/web/src/gate/oracles/`), reproduced by the TS port to 1e-6…1e-9;
  mink's own suite passed 112/112 as ground truth; and `posegen --verify`
  finally ran (closing an #8 caveat) — 33/33 poses independently re-gated by
  Python, exit 0.
- **Engine spike — GO** (2026-07-22, issue #6): benchmarked the official
  `@mujoco/mujoco` WebAssembly build with a humanoid+ball+floor scene against the
  [SPEC §11.7](docs/SPEC.md) interactive budget and cleared every target by 25×–500×
  (re-grade+report p95 0.2 ms · drag ≥ 60 fps · load ~0.2 s) — de-risking the
  ADR-0003/0007 core bet; the Rapier/Jolt fallback is not needed. Adds a committed,
  self-measuring spike page (`apps/web` `?spike`: three.js primitive renderer with
  z-up→y-up sync, an Embind `.delete()` lifetime registry, and a `mjv_applyPerturbForce`
  drag), a headless Playwright measurement harness (`npm run spike:measure`,
  [tools/spike-measure.mjs](tools/spike-measure.mjs)), and the go/no-go record
  [docs/spikes/0006-engine-benchmark.md](docs/spikes/0006-engine-benchmark.md). Records
  the measured numbers into SPEC §11.7/§9 and [ADR-0003](docs/decisions/0003-engine-and-compute.md).
  New deps in `apps/web`: `three`, `@mujoco/mujoco`, and `playwright` (dev).
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
