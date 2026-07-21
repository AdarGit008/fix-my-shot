# ADR-0007 — Application stack & repository layout

Status: Accepted
Supersedes: none
Superseded-by: none
Date: 2026-07-21

## Context

The spec ([SPEC.md](../SPEC.md)) and principles baseline ([principles-baseline.md](../principles-baseline.md)) are accepted; build kickoff is next. ADR-0002…0006 fix the product, engine, scoring, positioning, and sport seam, but no record names the application stack or repository layout, and the build-readiness audit (2026-07-21) flagged both as blockers. Founder decisions (2026-07-21): TypeScript + React + three.js on Vite in an npm-workspaces monorepo; the MJX offline pose pipeline is on the v1 critical path; v1 ships minimal `localStorage` progression. The OSS landscape ([research/oss-landscape.md](../research/oss-landscape.md)) grounds the engine-integration plan.

## Decision

**Stack.** TypeScript across the app; Python/JAX only in the offline MJX pipeline. Vite build; React UI shell; three.js scene (plain `three` canvas, react-three-fiber optional); Vitest for tests. Engine runtime is the official DeepMind WebAssembly bindings, **`@mujoco/mujoco`** (npm) — this refines ADR-0003's "official WebAssembly build" now that first-party bindings exist; `zalo/mujoco_wasm` (MIT) is vendored *reference* for drag interaction and MuJoCo↔three.js (z-up/y-up) conversion, not a dependency.

**Layout (npm workspaces — the ADR-0006 seam made physical).**

```
apps/web/            Vite + React shell; three.js scene; engine integration
packages/core/       sport-agnostic types: skeleton, implement, pose/phase,
                     form-objective — names no basketball concept (ADR-0006)
packages/basketball/ per-sport plugin: principle baseline as data (from
                     docs/principles-baseline.md), phase labels, contact specifics
packages/scoring/    measurement layer, phase-aware range scorer, leverage +
                     report model (ADR-0008)
tools/posegen/       Python/JAX MJX offline: pose-library generation (v1) and,
                     later, leverage gradients / validation (ADR-0003)
```

**Engine integration plan (from the landscape).** Humanoid seeded from dm_control `suite/humanoid.xml` (Apache-2.0), joint ranges cross-checked against `MyoHub/myo_sim` anatomical limits; the physical-validity gate is a TypeScript port of `kevinzakka/mink`'s QP formulation (Apache-2.0 — frame/posture/CoM tasks, joint-limit + collision inequalities), with three.js `CCDIKSolver` as an in-drag preview whose output is only a *proposal* to the MuJoCo gate (details in ADR-0009).

**v1 persistence.** `localStorage`-minimal: session history, per-principle trend, and top-fix continuity (the app remembers the current top fix and shows whether it improved). Fuller progression design stays an open question ([SPEC.md](../SPEC.md) §9).

**Type flip.** This ADR does **not** flip `baseline.repo.json`. Per ADR-0001, the flip `type: docs → node` happens in the **same PR that lands the first code** (the first build issue), which also sets ADR-0001's `Superseded-by:` to this ADR for its posture clause. Until then the build/test rules stay correctly dormant.

## Consequences

- The seam is enforceable from day one: ADR-0006's acceptance criterion (core names no basketball concept) becomes a per-package review boundary, not prose.
- Python enters the repo (`tools/posegen`) before the app is feature-complete — the accepted cost of putting the decided architecture (ADR-0003 MJX generation) on the v1 path instead of a throwaway in-browser generator.
- React + three.js maximizes ecosystem leverage (every MuJoCo-browser example speaks three.js) at the cost of framework weight a vanilla shell would avoid.
- Build/test baseline rules stay dormant until the first-code PR flips the type — tracked as the first milestone issue so it cannot be forgotten.
