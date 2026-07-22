# fix-my-shot — Spec of Record

**Version:** 0.2 — accepted, on `main` · **Phase:** pre-build (spec merged, no code yet) · **Date:** 2026-07-21

Grounded in cross-verified research batches — see [research/evidence.md](research/evidence.md).
Load-bearing decisions recorded as [ADR-0002](decisions/0002-product-definition.md) … [ADR-0009](decisions/0009-scene-pose-lifecycle-gate.md).
The scorer's single source of truth is [principles-baseline.md](principles-baseline.md) (the derived, phase-aware principle set).
Baseline posture unchanged (`type: docs` until first code lands — see [ADR-0001](decisions/0001-adopt-baseline.md)).

---

## 1. What it is (and is not)

fix-my-shot grades the quality of a **shooting-form pose** — a single captured moment of form, at **any phase** of the shot (the 5-phase taxonomy in [principles-baseline.md](principles-baseline.md): stance / dip / loading / set-release / follow-through) — against a **research-derived baseline of shooting principles**, on a **physically-real body + ball + floor** simulation. The user fixes the pose in a UI; the form is re-graded; a report surfaces what to fix.

It trains **execution** — *how to reliably hit what you are aiming at* — **not aim** (*where to send the ball*).

**It is NOT a shot-outcome simulator.** It does **not** simulate ball flight, does **not** decide whether a shot goes in, and does **not** coach aiming or targeting. The score is a **0–100 form-quality grade** — an evidence-anchored index of *how well this form embodies the principles*, **not a make probability** (there is no shot outcome in the loop; see [ADR-0008](decisions/0008-score-semantics.md)).

> This is the central reframe (ADR-0002). The earlier research explored ball trajectory / entry-geometry / make-quality (Noah 45/11/0, ballistic flight, drag, rim bounce); that whole layer is **explicitly out of scope**. The research still stands for what it established — the engine choice and the biomechanical parameters — but the product grades *form*, not *outcome*.

## 2. The core loop (the moat)

```
generate a body+ball+floor pose  →  user fixes the posture  →  form is re-graded  →  report (all fixes, ranked)
```

Everything else is dressing. The moat is a **trained eye + a mental model of good form + a parameter hierarchy**, embedded through repetition, **off-court** (no camera, gym, or ball required). A **persistence mechanism** carries progress across sessions and walks the user up the fix hierarchy — that is how users grow inside the app.

## 3. Scope

**In scope**
- One generated state: a **body (player) + ball + floor**. The floor is a fixed ground plane; foot–floor contact and ground reaction are part of the model (base, balance, leg drive, whole kinetic chain).
- Grading a **static pose** at any shot phase (phase-aware; the phase is **labeled at generation** and pinned through edits — [ADR-0009](decisions/0009-scene-pose-lifecycle-gate.md)).
- Backspin **mechanics** assessed from hand / finger / wrist placement and ball touch-point / contact-region geometry (visible in the pose — no flight needed; a static **produced-backspin** proxy, not a spin rate — see [principles-baseline.md](principles-baseline.md)).
- A physics engine that holds a realistic pose, enforces physical validity, and measures the form the heuristic grades.
- Editing the pose (drag joints) behind a physical-validity gate; re-grading; a ranked report.
- A persistence / progression mechanism (cross-session growth up the fix hierarchy).

**Out of scope (deliberately)**
- Ball **trajectory**, make/miss, entry geometry, aim/targeting, "where to shoot."
- Air resistance / drag, rim & backboard, and other environment variables — treated as **constants**; not modeled.
- Defenders, court context, game situations.
- Computer-vision capture of the user's real shot (a *future* direction — see ADR-0005, not the MVP).

## 4. The scene

Exactly three physical elements: **player body**, **ball**, **floor** (fixed ground plane), plus one **non-physical reference**: a **fixed virtual target** (direction + nominal free-throw geometry) that orients every "toward-hoop" principle. No environment beyond the floor; nothing travels to the target ([ADR-0009](decisions/0009-scene-pose-lifecycle-gate.md)). Realism lives in the *body+ball+floor state* — honest joint limits, anthropometry, hand–ball contact geometry, and foot–floor ground reaction — **not** in any simulated flight.

## 5. Physics engine & compute (ADR-0003)

- **Engine = the heart; realism is key** — but "realism" here means a *physically honest pose*, not a simulated shot. The engine (a) represents the body+ball+floor pose realistically, (b) enforces physical validity of edited poses, (c) measures the form quantities the heuristic grades (joint angles, alignment, center-of-mass over base, **foot–floor ground reaction**, hand/ball contact → backspin mechanics), and (d) computes the *leverage* of a fix on the form score.
- **Quasi-static, not full live dynamics.** We grade a frozen pose under a feasibility gate; we do not simulate continuous motion or hand–ball grip release. (Confirmed feasible + defensible in batch 2; full live contact-rich dynamics is the field's hardest open problem and unnecessary here.)
- **No ball trajectory.** The ballistic-flight half of the earlier "quasi-static + ballistic" decision is **removed** by the §1 reframe.
- **Runtime:** MuJoCo via official WebAssembly build, in-browser, with primitive (capsule/link) rendering — realism over aesthetics. Deterministic.
- **Offline:** MuJoCo **MJX** (JAX, differentiable, GPU/TPU) for starting-state generation and for gradients that feed the leverage layer. MJX is ~10× slower per single scene, so it stays offline — never on the interactive path.
- **Contact:** foot–floor (and hand–ball) contact is in the model; contact settings are smoothed (e.g. `solimp[0]=0`) where leverage gradients flow through them, so the leverage signal stays usable.

## 6. Scoring model (ADR-0004)

Grade a pose against a **research-derived baseline of shooting principles**, phase-aware.

- **Baseline = shooting principles expressed as ranges.** There is no single "one way" (verified: no single optimal shot; consistency beats conformance), but there **are** principles that are written in stone — the non-negotiable fundamentals — encoded as acceptable **ranges**.
- **Style vs conflict:**
  - **Style** = divergence from the baseline that stays **inside** the range → **allowed, never penalized**.
  - **Conflict** = divergence that falls **outside** the range (breaks a principle) → **penalized**.
- **Phase-aware:** good form in the loading phase ≠ good form at release; the baseline is defined per phase (the 5-phase taxonomy in [principles-baseline.md](principles-baseline.md)).
- **Aggregation = gate + weighted deductions** ([ADR-0008](decisions/0008-score-semantics.md)): a **written-in-stone** violation **caps** the 0–100 grade; **guideline** violations subtract graded, band-width-normalized deductions; in-range **style** is never deducted.
- **All fixes, ranked.** The report surfaces **every** fix, ranked by leverage. The **top fix** is where growth concentrates; the persistence mechanism walks the user up the hierarchy over repeated use.
- **Fix hierarchy = HYBRID** (engine + expert): the engine computes per-pose leverage (differentiable sensitivity of the form score to each parameter); this is **stability-gated, grouped into coach-meaningful clusters (BEEF-style: base, eyes, elbow/alignment, follow-through), and re-labeled in expert vocabulary.** Not raw gradients (unstable → teaches noise); not a fixed expert ranking (state-blind — cannot say "for *this* pose, fix X first").
- **Leverage robustness:** because pose parameters are geometrically coupled, single-fix attribution must be made robust (grouped, conditional on coupled params, suppressed when a ranking flips under a small pose perturbation, and validated offline against the MJX differentiable oracle — [ADR-0008](decisions/0008-score-semantics.md)), or it re-imports false precision. The interactive leverage signal is in-browser **finite differences** on the analytic form score; MJX gradients validate it offline, never on the interactive path.

## 7. Positioning & the transfer thesis (ADR-0005)

- **Thesis:** players learn the principles and how to *spot misalignments*; repeated and off-court, that knowledge embeds into their mental model; improved awareness makes their **own** physical practice more effective.
- **Positioning:** an off-court **scaffold** / shot-literacy trainer that sharpens the eye — **complements**, never replaces, real reps. Not a video-analysis competitor; no camera/gym/ball needed.
- **Awareness is a necessary learning phase**, not a flaw — no athlete skips the stage of consciously attending to form. Design note (narrow): the report speaks in **external-focus cues** (target / ball / arc), not internal body-part commands, and the aim is awareness *now* → automaticity *later*; we do not encourage conscious mechanical focus during live, under-pressure shooting.
- **Transfer is a CONDITIONAL-GO**, validated by a pre-registered **3-arm RCT** (trainer + reps vs reps-only vs trainer-no-reps; endpoints: real make% + release-velocity consistency at 4 weeks + a pressure retention test). Scaling any transfer claim is gated on this readout.

## 8. Sport-agnostic seam (ADR-0006)

Basketball is the MVP; the seam is **thin and deliberate**: generic **core types** (skeleton, implement, pose/phase, form-objective) with **per-sport plugins** (principle baseline, phase segmentation, implement/contact specifics). Do not build a second sport until the transfer bet validates — generality is cheap to preserve as clean interfaces, expensive to build speculatively.

## 9. Open questions

**Resolved since v0.1** (now decided — kept here as pointers): the **baseline** is derived and cross-verified ([principles-baseline.md](principles-baseline.md), batches 3–4; issue #3 gaps closed); **phase detection** is sidestepped for v1 — phase is **labeled at generation** and pinned by bounded per-parameter editing, with a frame classifier deferred ([ADR-0009](decisions/0009-scene-pose-lifecycle-gate.md)); **score aggregation** and **interactive leverage** are fixed ([ADR-0008](decisions/0008-score-semantics.md)); **stack + layout** and **v1 persistence** are fixed ([ADR-0007](decisions/0007-app-stack-and-layout.md)).

**Still open:**
- **Pose realizability (strength).** The MVP validity gate covers joint limits + quasi-static balance + contact-penetration ([ADR-0009](decisions/0009-scene-pose-lifecycle-gate.md)); stricter joint-torque / strength feasibility remains the single least-studied link and is deferred.
- **Persistence mechanism design (full).** v1 ships `localStorage`-minimal (history, per-principle trend, top-fix continuity); the full cross-session progression/retention loop that walks users up the hierarchy is still to be designed.
- **In-browser performance budget.** Numeric targets (§11.7) are now **benchmarked and met**. The issue #6 spike loaded the humanoid+ball+floor scene (nq 35, 21 geoms, 21 actuators) in the official `@mujoco/mujoco` WASM build and measured re-grade+report **p95 0.2 ms**, drag **≥ 60 fps** (software-GL floor; ~2500 fps CPU capacity), and initial load **~0.2 s** — every budget cleared by 25×–500× (**GO**; [spike record](spikes/0006-engine-benchmark.md)). Residual: numbers are from the dev machine, not a certified mid-range reference — but the margins swamp any plausible machine gap.
- **Remaining baseline deferrals.** A handful of principle ranges are honestly deferred pending instrumented studies (wrist-release-flexion angle, heel-off timing, ball-to-palm gap in units, backspin *rate* from static pose) — see *Resolved gaps* in the baseline; none blocks v1 (each has a working proxy or presence-check).

## 10. Residual risks

- **Transfer is unproven** (and, if badly framed, possibly negative) — the RCT is the go/no-go.
- **Baseline authority:** the score is only as credible as the research baseline; "written in stone" principles must be genuinely defensible, not folklore.
- **Leverage can teach noise** if attribution isn't made robust.
- **Realizability:** grading poses a real body couldn't produce would undermine the whole premise.

## 11. Acceptance criteria (this spec is "met" when)

1. Given a generated pose (any phase) of **player + ball + floor**, the system returns a **form-quality score** derived from the research baseline, with **no** ball-trajectory, make/miss, or aim computation.
2. Every editable pose (including after a user edit) passes a **physical-validity gate** — joint limits, quasi-static balance over the base, and foot–floor / hand–ball contact feasibility — **before** it is scored.
3. The scorer **never penalizes in-range style**; only **out-of-range** (principle-violating) divergence reduces the score. Verified against phase-appropriate baselines.
4. **Backspin** is assessed from hand/finger/wrist placement + ball touch points in the pose — never from simulated flight.
5. The report surfaces **all** fixes, ranked; the **top fix is stable** under small pose perturbations (no rank jitter between near-identical poses).
6. Fix guidance uses **external-focus phrasing** (target/ball/arc), not internal body-part commands.
7. Re-grading an edit is **deterministic** and returns within an interactive budget in-browser: **re-grade + report ≤ 100 ms**, **drag interaction ≥ 30 fps**, **initial load ≤ 5 s** on a mid-range laptop. (Benchmarked by the issue #6 spike — re-grade+report **p95 0.2 ms**, drag **≥ 60 fps**, load **~0.2 s** on the dev machine, all far inside budget: **GO** — [spike record](spikes/0006-engine-benchmark.md). Confirmation on a defined mid-range reference is the one remaining check; determinism of the full scorer is proven with the scorer, issues #10–#14.)
8. Any **transfer/efficacy claim** in product copy is gated on the RCT; until then, copy uses **scaffold framing**.
9. The sport-specific logic lives behind **plugin interfaces**; the core types name no basketball-specific concept.

## 12. Decisions index

| ADR | Decision |
|---|---|
| [0002](decisions/0002-product-definition.md) | Product is a **pose/form grader**, not a shot-outcome simulator; execution not aim |
| [0003](decisions/0003-engine-and-compute.md) | Quasi-static pose grading; **no trajectory**; floor in scope; MuJoCo/WASM + MJX offline; differentiable leverage |
| [0004](decisions/0004-scoring-model.md) | Baseline = shooting principles as **ranges**; style (in-range) vs conflict (out-of-range); phase-aware; all fixes ranked; **hybrid** hierarchy + persistence growth loop |
| [0005](decisions/0005-positioning-and-transfer.md) | Off-court **scaffold**; awareness-as-learning-phase; external-focus cues; transfer = conditional-go gated on an **RCT** |
| [0006](decisions/0006-sport-agnostic-seam.md) | **Thin seam**: generic core + per-sport plugins; basketball MVP only |
| [0007](decisions/0007-app-stack-and-layout.md) | **Stack**: TS + React + three.js + Vite monorepo; `@mujoco/mujoco`; package seam; MJX pose pipeline; minimal persistence |
| [0008](decisions/0008-score-semantics.md) | **Score**: 0–100 form grade (not probability); gate + weighted deductions; interactive finite-difference leverage, MJX offline oracle |
| [0009](decisions/0009-scene-pose-lifecycle-gate.md) | **Scene/lifecycle**: virtual target; MJX pose library + fault injection; phase labeled + bounded editing; validity gate; report structure |

## 13. Evidence base

All load-bearing claims are cross-verified (quote + URL, independently re-fetched). See [research/evidence.md](research/evidence.md), including the claims that were **refuted** in verification and must not be relied on.
