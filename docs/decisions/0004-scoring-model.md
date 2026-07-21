# ADR-0004 — Scoring model & fix hierarchy

Status: Accepted
Supersedes: none
Superseded-by: none
Date: 2026-07-20

## Context

The score is the report; mis-weighting it makes the product confidently wrong. Research is clear there is no single optimal shot (consistency beats conformance) and that release angle does not distinguish makes — so grading against one "ideal" pose is folklore. The founder's model: a research-derived baseline of principles expressed as ranges, where personal style is tolerated unless it breaks a principle, and where all fixes are surfaced but the top fix drives growth via a persistence mechanism.

## Decision

- **Baseline = shooting principles as RANGES.** No single "one way," but principles written in stone (the non-negotiable fundamentals) encoded as acceptable ranges, **phase-aware** (wind-up ≠ release).
- **Style vs conflict:** *style* = divergence that stays **inside** the range → allowed, never penalized. *Conflict* = divergence that falls **outside** the range → penalized.
- **All fixes, ranked; top fix prioritized.** The report surfaces every fix ranked by leverage; the top fix is where growth concentrates, and a **persistence mechanism** walks the user up the hierarchy across sessions.
- **Fix hierarchy = HYBRID.** The engine computes per-pose leverage (differentiable sensitivity of the form score to each parameter); it is **stability-gated, grouped into coach-meaningful clusters (BEEF-style), and re-labeled in expert vocabulary.** Not raw gradients (unstable → teaches noise); not a fixed expert ranking (state-blind — can't say "for *this* pose, fix X first").
- **Leverage robustness:** pose parameters are geometrically coupled, so single-fix attribution is made robust (grouped, conditional on coupled params, suppressed when a ranking flips under a small pose perturbation) and validated against empirical predictors.
- Score is **form quality**, not make probability (ADR-0002).
- **Instantiation:** the concrete baseline — the phase taxonomy, per-phase principle ranges, and the `written-in-stone` / `style-tolerant` / `excluded` lists — lives in [docs/principles-baseline.md](../principles-baseline.md) (derived + cross-verified, research batches 3–4). It is the scorer's single source of truth; the batch-3 numeric gaps (issue #3) are now **closed** — each pinned, proxied, or deferred with rationale.
- **Aggregation:** how per-principle range-memberships combine into the single 0–100 form grade (gate + weighted deductions; written-in-stone caps, guideline graded, style never penalized) and how interactive leverage is computed (in-browser finite differences; MJX offline as validation oracle) are fixed in [ADR-0008](0008-score-semantics.md).

## Consequences

- Avoids the false-precision trap by grading ranges + repeatable mechanics, never conformance to one ideal.
- **The baseline is now derived** ([docs/principles-baseline.md](../principles-baseline.md)) and turned out deliberately **small on written-in-stone** — the non-negotiables are structural (balance, ground contact, kinetic-chain sequencing, phase-appropriate extension, and consistency-over-conformance), while most specific joint angles are wide guideline/style bands because the evidence shows they do not discriminate skill. Remaining numeric gaps (issue #3) still need instrumented ranges.
- The leverage layer is the riskiest piece: without robustness gating it can teach noise, corroding the stable mental model that is the moat.
- Backspin is scored from hand/finger/wrist placement + ball touch points (form), consistent with ADR-0003.
