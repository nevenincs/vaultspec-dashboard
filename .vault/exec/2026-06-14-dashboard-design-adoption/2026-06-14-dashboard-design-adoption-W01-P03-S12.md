---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S12'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---




# Rebuild the four tier hues in OKLCH at fixed lightness and chroma so they stay distinguishable in grayscale projection by construction

## Scope

- `frontend/src/styles.css`

## Description

- Rebuild the four tier hues in OKLCH at fixed lightness and chroma so they stay distinguishable in grayscale projection by construction.
- Assign each tier a DISTINCT lightness (declared darkest, structural and temporal mid, semantic lightest) so the grayscale channel alone separates them, with hue as redundant reinforcement that can be stripped without collapse.

## Outcome

The four tiers are grayscale-safe by construction: their lightness ordering is monotonic and separated, so a grayscale render keeps them legible (ADR layer 3). Hue is the redundant channel, not the load-bearing one.

## Notes

This honors the scene's existing encoding discipline (treatment primary, hue secondary) at the token level: the tier hex the scene reads now carries the separation in lightness, reinforcing the line-treatment channel rather than competing with it.
