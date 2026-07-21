# ADR-0008 — Score semantics, aggregation & interactive leverage

Status: Accepted
Supersedes: none
Superseded-by: none
Date: 2026-07-21

## Context

ADR-0004 fixed the scoring *model* (ranges, style-vs-conflict, hybrid leverage) and [principles-baseline.md](../principles-baseline.md) enumerates the principles, but neither said **how per-principle results combine into one number**, and SPEC §1 called the score "the probability that this form contributes to a high-quality, repeatable shot" — a *probability* nothing calibrates. The build-readiness audit flagged this as a blocker (a score with no aggregation rule cannot be implemented, and an uncalibrated "probability" label is a claim we cannot back). A second blocker: ADR-0003 requires per-pose leverage *interactively* but routes the only gradient path (MJX) *offline only* — a contradiction with no interactive mechanism named.

## Decision

**The score is a form grade, not a probability.** Output is a **0–100 form-quality grade**. Drop the "probability" wording from product/spec copy; the grade is an internal, evidence-anchored quality index, never a make/quality probability (there is no ground-truth outcome in the loop — ADR-0002).

**Aggregation = gate + weighted deductions.**
- **In-range / style-variant → never deducted** (acceptance criterion 3). Only out-of-range divergence reduces the score.
- **Written-in-stone violation → caps the score.** A broken fundamental sets a ceiling that falls with violation depth, so a broken fundamental can never be arithmetically buried under many small greens (a pose that is off-balance cannot read 82).
- **Guideline violation → graded, band-width-normalized deduction** (distance outside the range ÷ the range's own width), so wide/soft bands penalize gently and tight bands bite.
- **Per phase.** Deductions are computed against **phase-appropriate** ranges only (the pose's labeled phase — ADR-0009); a marker not applicable to the phase contributes nothing.
- **Proxies** (produced-backspin, load-presence, guide-hand, wrist-cock direction) deduct at **guideline** weight on **mechanism conflicts** only, never toward a target value.

**Interactive leverage = in-browser finite differences on the analytic form score; MJX is offline-only.** The form score itself is cheap and analytic (angles, memberships, projections over the WASM pose), so per-parameter leverage is computed interactively as **finite-difference sensitivities** of that score to small, feasibility-gated perturbations of each editable parameter — no gradient engine on the interactive path. MJX (differentiable, ~10× slower per scene) is reserved for **offline** pose-library generation and for **validating** the in-browser leverage against differentiable gradients — never per-interaction. This resolves the ADR-0003 contradiction: "differentiable leverage" (ADR-0003/0004) is realized offline as the validation oracle; the interactive signal is finite-difference.

**Leverage stays hybrid & robust (ADR-0004 unchanged).** Finite-difference sensitivities are **stability-gated** (a fix is suppressed when its rank flips under a small pose perturbation — acceptance criterion 5), **grouped** into coach-meaningful BEEF-style clusters, and **re-labeled** in expert vocabulary before display. Raw per-parameter numbers are never shown.

## Consequences

- The score is now implementable and honestly labeled; "probability" copy is removed from SPEC §1.
- The cap rule makes the fundamentals *structurally* dominant, matching the deliberately-small written-in-stone set — the product cannot reward a clean set of details over a broken base.
- Interactive leverage is deterministic and cheap; the ADR-0004 "validated against empirical predictors" clause is served offline by the MJX oracle plus the RCT readout (ADR-0005), not on the interactive path.
- Risk retained: finite-difference leverage inherits local-gradient fragility (evidence base) — the stability gate is load-bearing; without it the hierarchy teaches noise. This is the first thing the leverage build must prove.
- The exact penalty curves, tier weights, and cap function are calibration parameters tuned during the scorer build (tracked as a build issue), not frozen here; this ADR fixes their **shape and invariants**, not their constants.
