---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S02'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---

# Alias the primitive ramps into a Radix-style 12-step semantic token tier named for role (surface/ink/border/accent/focus), supplying discrete hover, pressed, and focus-ring steps

## Scope

- `frontend/src/styles.css`

## Description

- Alias the primitive ramps into a Radix-style twelve-step semantic token tier named for role rather than value.
- Define surface roles (base, raised, sunken), border roles (subtle, strong), accent and focus roles (base, hover, pressed, subtle, on-subtle, focus-ring), and ink roles (faint, muted, body).
- Supply the discrete hover, pressed, and focus-ring accent states the prior single-tier file lacked, as explicit semantic steps.
- Make the semantic tier the single layer a theme remaps: a primitive never appears in a `[data-theme]` block, only a semantic role does.

## Outcome

The semantic tier is the contract a theme remaps. Every role is named for why it exists (a surface, an ink, a border, a focus ring), and the discrete interactive states (hover, pressed, focus-ring) are first-class rather than improvised at call sites.

## Notes

The pressed accent steps are authored as explicit OKLCH values rather than ramp aliases because they sit between ramp stops; this is deliberate and documented inline.
