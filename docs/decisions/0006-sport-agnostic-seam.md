# ADR-0006 — Sport-agnostic seam

Status: Accepted
Supersedes: none
Superseded-by: none
Date: 2026-07-20

## Context

The concept commits to being sport-agnostic underneath, with basketball as the MVP. Research found the skeleton / contact / pose core is plausibly reusable, but the principle baseline, phase segmentation, and implement/contact specifics are sport-specific — and that the "one model spans all sports" claim is asserted, not evidenced. Over-abstracting before a second sport exists is a classic time sink; hardcoding basketball risks a rewrite.

## Decision

Draw a **thin, deliberate seam**: generic **core types** — skeleton, implement, pose/phase, form-objective — with **per-sport plugins** for the principle baseline, phase segmentation, and implement/contact specifics. Build **basketball only**. Do not build a second sport until the transfer bet (ADR-0005) validates. Keep the core types free of any basketball-specific concept.

## Consequences

- Generality is preserved cheaply as clean interfaces, not built speculatively; low rewrite risk when a second sport eventually lands.
- The MVP stays focused on proving the basketball moat.
- Acceptance criterion: sport-specific logic lives behind plugin interfaces; core types name no basketball concept.
