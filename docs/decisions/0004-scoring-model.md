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

## Consequences

- Avoids the false-precision trap by grading ranges + repeatable mechanics, never conformance to one ideal.
- **The baseline itself is not yet derived** — building and validating the phase-aware principle-ranges is the next research/definition deliverable (open question).
- The leverage layer is the riskiest piece: without robustness gating it can teach noise, corroding the stable mental model that is the moat.
- Backspin is scored from hand/finger/wrist placement + ball touch points (form), consistent with ADR-0003.
