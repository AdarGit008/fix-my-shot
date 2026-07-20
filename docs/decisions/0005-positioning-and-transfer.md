# ADR-0005 — Positioning & the transfer thesis

Status: Accepted
Supersedes: none
Superseded-by: none
Date: 2026-07-20

## Context

The existential bet is whether the app improves a user's real shot, and how it is positioned against incumbents who already read biomechanics from phone video of a real shot. The founder's thesis: players learn the principles and how to spot misalignments; repeated and off-court, that knowledge embeds into their mental model; improved awareness makes their own practice more effective. Research gives a moderate pro case (feedback aids retention/transfer; quiet-eye and observational learning improve real shooting; error-detection is the durable mechanism) and a real skeptic case (motor acuity comes from physical reps and is dissociable from declarative knowledge; far transfer from generic off-court perceptual training is unsupported; conscious rule-based mechanical focus can degrade skilled execution under pressure).

## Decision

- **Position as an off-court SCAFFOLD / shot-literacy trainer** that sharpens the eye and mental model — complements, never replaces, physical practice. No camera/gym/ball needed. The moat is the trained eye + principle knowledge + parameter hierarchy, embedded by repetition.
- **Awareness is a necessary learning phase, not a flaw** — no athlete skips consciously attending to form. We do not treat awareness as harmful.
- **Design guardrail (narrow):** reports speak in **external-focus cues** (target/ball/arc), not internal body-part commands; the goal is awareness *now* → automaticity *later*; we do not encourage conscious mechanical focus during live, under-pressure shooting.
- **Transfer is a CONDITIONAL-GO.** Do not ship a passive/substitute efficacy claim. Validate with a pre-registered **3-arm RCT**: (A) trainer + physical reps, (B) reps only, (C) trainer with no reps; endpoints = real on-court make% + release-velocity consistency at 4 weeks + a pressure retention test. Scaling any transfer claim is gated on this readout.

## Consequences

- Honest, defensible positioning that neutralizes the internal-focus/reinvestment downside risk and does not collide head-on with CV incumbents.
- Commits the roadmap to a validation study before efficacy marketing.
- A future direction (not MVP): close the loop onto the user's **own** shot (import pose/video) to maximize near-transfer — inherits CV noise and a larger build.
