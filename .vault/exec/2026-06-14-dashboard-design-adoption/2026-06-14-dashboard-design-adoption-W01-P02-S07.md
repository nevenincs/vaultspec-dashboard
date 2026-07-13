---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S07'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---

# Build the light theme as a [data-theme=light] remap of the semantic tier, peer to dark with warm low-chroma neutral ground

## Scope

- `frontend/src/styles.css`

## Description

- Build the light theme as an explicit `[data-theme=light]` remap, symmetric with the dark and high-contrast peers rather than relying only on the :root defaults.
- Remap the semantic tier and the public surface to the warm low-chroma light renderings, so an explicit light selection is a first-class peer.

## Outcome

Light is an explicit peer block, not just the implicit default, so the three themes are symmetric and a manual light override behaves identically to a dark or high-contrast override.

## Notes

The :root defaults still carry the light values so the app renders correctly before the theme controller sets data-theme; the explicit light block makes the manual-override path symmetric.
