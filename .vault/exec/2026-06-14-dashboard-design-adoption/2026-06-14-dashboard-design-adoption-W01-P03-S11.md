---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S11'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---

# Derive the warm low-chroma neutral surfaces carried into dark as warm near-black, plus the single muted earthy accent for highlights and selection rings

## Scope

- `frontend/src/styles.css`

## Description

- Derive the warm low-chroma neutral surfaces from the neutral ramp and carry them into dark as a warm near-black ground rather than a cold blue-black.
- Define the single muted earthy-green accent (and its hover, pressed, subtle, on-subtle, and focus-ring steps) as the only spent hue for interactive highlights and selection rings.

## Outcome

Warmth lives only in the neutral hue and the one accent (ADR layer 9); there is no second accent, no gradient, no texture. The warm ground is consistent across light, dark, and high-contrast.

## Notes

The accent is tone-matched to the structural/active state green so interactive affordances and resolved-state semantics share a family, as in the prior palette - continuity preserved while the values moved to OKLCH.
