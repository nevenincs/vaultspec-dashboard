---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S08'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---

# Build the first-class high-contrast theme as a [data-theme=high-contrast] remap of the same semantic set, no component aware of the active theme

## Scope

- `frontend/src/styles.css`

## Description

- Build the first-class high-contrast theme as a `[data-theme=high-contrast]` remap of the same semantic set, with no component aware of the active theme.
- Use a near-black ground and near-white ink for maximum separation, lift the border tokens to visible separators (unlike the felt-not-seen borders of light/dark), and raise accent/state/tier renderings so every load-bearing pair clears the raised high-contrast floor.
- Replace the soft elevation shadows with 1px outline rings so depth reads without relying on shadow contrast.

## Outcome

High-contrast is a peer remap of the identical semantic roles, not a special-cased mode. Every text, border, accent, state, and tier pair clears at least 4.5:1 against its ground (S17), and borders become visible separators.

## Notes

In high-contrast the rule tokens are deliberately lifted to a visible lightness (unlike the intentionally-quiet rule tokens in light/dark) because a11y users need the separators; this is the documented exception to the felt-not-seen border discipline.
