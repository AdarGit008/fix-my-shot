# ADR-0002 — fix-my-shot grades a pose, not a shot

Status: Accepted
Supersedes: none
Superseded-by: none
Date: 2026-07-20

## Context

The initial concept was framed around a physics engine simulating a shot and, implicitly, its outcome. Two research batches explored ball trajectory, entry geometry, and make-quality (Noah 45/11/0, ballistic flight, drag, rim bounce). The founder then set the actual scope: we capture **a moment in time — a glimpse of shooting form, at any phase** — and grade the **form/pose**, not the trajectory and not whether the shot goes in. The product teaches **execution** ("how to hit what you are aiming at"), not **aim** ("where to send the ball").

## Decision

fix-my-shot grades the quality of a **static shooting-form pose** (any phase: wind-up, set, release, follow-through) against a research-derived baseline of shooting principles, on a physically-real **body + ball + floor** state. The score is *the probability that this form contributes to a high-quality, repeatable shot attempt* — a **form-quality grade, not a make probability**.

Explicitly **out of scope:** ball trajectory, make/miss, entry geometry, aiming/targeting, air resistance, rim/backboard, and all environment variables beyond the fixed floor (treated as constants).

## Consequences

- **Easy / de-risked:** removes the field's hardest problems from the critical path — no live contact-rich dynamics, no ballistic flight, no drag/rim modeling, no make-quality validation against ground truth.
- **Backspin** becomes a *form* feature read from hand/finger/wrist placement and ball touch points (see ADR-0003/0004), not a rim-collision outcome — dissolving a batch-2 caveat.
- **Cost:** the product lives or dies on the **form baseline** (ADR-0004) and on **transfer** (ADR-0005), not on physics fidelity of a flight it never simulates.
- Supersedes the earlier batch-1/batch-2 *outcome-geometry* direction; that evidence is retained only for engine choice and biomechanical parameters ([evidence](../research/evidence.md)).
