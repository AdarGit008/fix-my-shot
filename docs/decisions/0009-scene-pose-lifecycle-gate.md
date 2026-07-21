# ADR-0009 — Scene target, pose lifecycle & the validity gate

Status: Accepted
Supersedes: none
Superseded-by: none
Date: 2026-07-21

## Context

The build-readiness audit surfaced a cluster of load-bearing gaps that all concern the *pose lifecycle* — where poses come from, what the scene actually contains, how a user edits, and what keeps an edit physically real: (1) many principles are "toward the hoop" but the scene has no hoop or target direction; (2) pose generation (step 1 of the core loop) was undefined; (3) phase classification was listed as an open question yet is the mandatory first scoring step; (4) the pose parameterization / edit mechanism was unspecified; (5) the physical-validity gate had no algorithm or failure behavior; (6) report content/format and the external-focus-cue mapping were undefined. Founder direction (2026-07-21): poses are **labeled at generation**, and **users are not allowed to drag a pose out of its phase** — every joint / touch-point / ball position + orientation / floor-contact parameter is bounded to a phase-appropriate range.

## Decision

**Virtual target.** Attach a **fixed virtual target** to the scene: a target *direction* (azimuth) plus a nominal free-throw geometry (rim 3.05 m high, 4.57 m ahead of the stance). Every "hoop"-referenced principle in [principles-baseline.md](../principles-baseline.md) resolves against this direction; coarse pitch-dependent checks use direction only. **No ball flight is computed** — the target orients the body, nothing travels to it (ADR-0002 intact).

**Pose generation (MJX offline library).** Starting poses are generated **offline** by the MJX pipeline (`tools/posegen`, ADR-0007) and shipped as **static, phase-labeled assets**. Generation samples an in-range baseline pose for a phase, then **injects faults** by perturbing N parameters out of range with controlled magnitude (so the report always has something true to surface). **Every shipped pose passes the validity gate** before it ships. No in-browser generation in v1.

**Phase is labeled, never inferred (v1).** Each pose carries its phase label from generation; the label is **pinned through editing**. This is enforced by the editor: **edit ranges are bounded per parameter** (each joint DOF, hand/finger touch point, ball position + orientation, foot–floor contact) to stay inside the labeled phase, so a pose **cannot be dragged into another phase**. A frame-from-readings phase classifier is **deferred** to a later version (the six characterizing readings are recorded in the baseline as its future spec).

**Editing & pose parameterization.** The editable state is a declared subset of the model `qpos` (joint DOFs) plus the ball pose and hand/ball contact encoding; non-editable elements (e.g. the floor plane, the target) are fixed. The user drags an end-effector; a constrained-IK preview (three.js `CCDIKSolver`) proposes a pose; the **MuJoCo validity gate is the authority** (ADR-0007). Every edit is clamped to the per-parameter phase bounds above *before* the gate runs.

**Validity gate (MVP).** A pose passes iff: (a) all **joint limits** are respected (anatomical ranges — dm_control/myo_sim); (b) the **COM projects inside the foot-contact support polygon** (quasi-static balance — the SPEC balance criterion); (c) **contact penetration** (foot–floor, hand–ball) is below tolerance ε. Failure behavior = **reject-and-revert** (or constrained projection back onto the feasible set) in the edit UI — an invalid pose is never scored (acceptance criterion 2). Stricter realizability (joint-torque / strength feasibility) is **deferred** and noted as the least-studied link (SPEC §9).

**Report.** The re-grade returns a structured result: overall 0–100 grade (ADR-0008), the pose's phase, a per-principle result (tier, range, in/out), and a **ranked fix list** (BEEF-style cluster + external-focus cue). Fix guidance uses **external-focus phrasing** (target / ball / arc), not internal body-part commands (ADR-0005, acceptance criterion 6); where no honest external-focus phrasing exists for a principle, the sanctioned wording is recorded alongside that principle. The exact JSON schema and the full per-principle cue table are produced during the scorer/report build (tracked as build issues); this ADR fixes the report's **contents and invariants**.

## Consequences

- The scene is now fully specified (body + ball + floor + a non-physical target reference) and every "toward-hoop" principle has a concrete referent — without reintroducing aim or flight.
- Bounding edits to the labeled phase sidesteps the unbuilt classifier *and* the un-pinned classifier thresholds entirely for v1, at the cost of forbidding cross-phase edits (revisited if a later version adds free-form editing + classification).
- Fault-injected generation guarantees the core loop always has a real fix to teach and keeps the shipped library gate-valid by construction.
- The gate is the realizability guard the whole premise rests on; the mink-derived QP is the hardest single build item (SPEC §10) and is the first thing to prove against mink's own test suite (ADR-0007).
- Report schema and cue wording are deferred to build issues, so this record stays a decision, not a spec dump.
