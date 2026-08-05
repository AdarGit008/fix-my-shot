# ADR-0010 — Drag preview is the gate's own incremental projection

Status: Accepted
Supersedes: ADR-0009 (CCDIKSolver-preview clause)
Superseded-by: none
Date: 2026-08-06

## Context

ADR-0009 specified the pose editor's in-drag preview as a three.js `CCDIKSolver`
whose output is a proposal to the MuJoCo validity gate. That decision predates the
landed gate (issue #9): building issue #10 against the real facade changed the
calculus.

1. The mink-ported projection already exposes the exact seam the editor needs
   (`createGate`'s `extraTasks`/`extraLimits`), and lane/9's gate property test
   proves **every intermediate qpos of a projection passes the authority** — the
   projection isn't just a validator, it is a legal-poses-only animation path.
2. Measured on this scene (vitest-node, CPU-only work): a 2-step projection under
   the full editor limit set costs **avg 0.98 ms · p95 1.73 ms · max 2.6 ms** per
   pointer frame — 5–10% of a 60 fps frame, far inside the SPEC §11.7 ≥ 30 fps
   drag budget the issue-#6 spike cleared with 25×–500× margins.
3. A `CCDIKSolver` preview requires mirroring the humanoid into a three.js
   bone hierarchy and mapping solved bone rotations back onto the model's
   multi-hinge joints — whose axes are **non-orthogonal** (shoulder pairs
   (2,1,1)/(0,−1,1), hip triples), so the mapping is a numeric decomposition,
   not a lookup. That is a second kinematic model that can drift from the
   gate's, feeding a preview the gate re-checks anyway. All cost, no authority.

## Decision

The live drag preview **is the gate projection, run incrementally**: each pointer
frame advances the preview with a small-step projection (`previewSteps = 2`) from
the current preview state toward the pointer target, under the full editor limit
set (per-phase envelope, ball↔hand tether, editor collision pairs). What the user
sees mid-drag is therefore already gate-feasible and phase-bounded — the preview
cannot show a pose the phase forbids.

Releasing the pointer runs **one authoritative projection from the drag's anchor
(the committed pose) to the final target** (`maxSteps = 50`), then the three-check
authority; reject-and-revert is unchanged (ADR-0009). The committed result is a
single deterministic projection, never the accumulated preview path.

`CCDIKSolver` is not used. `zalo/mujoco_wasm` stays vendored as interaction
reference only (ADR-0007 unchanged).

## Consequences

- One IK implementation. The preview, the proposal, and the authority share the
  same ported formulation — no bone-mirror to keep in lockstep, no non-orthogonal
  axis decomposition to get subtly wrong.
- The preview is constraint-aware: limbs visibly stop at phase bounds and the
  ball tows with the hand during the drag, instead of a cosmetic preview snapping
  on release.
- The per-frame budget spends ~1 ms of CPU where CCDIK would spend ~0; the spike's
  measured margins absorb this by orders of magnitude. If a weaker reference
  machine ever fails the 30 fps budget, a cosmetic preview can be reintroduced
  behind `EditorSession.previewDrag` without touching the commit path.
- Issue #10's scope line naming `CCDIKSolver` is delivered by this mechanism
  instead; recorded here rather than silently diverging (ADR-0009's preview
  clause is marked superseded by this record).
