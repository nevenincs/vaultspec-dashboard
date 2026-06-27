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

## Revision (design review, batch 1)

MEDIUM-2 (grayscale safety): the dark and high-contrast tier-hue L-values were spread so
adjacent tiers reach a >=1.50:1 grayscale (luminance) gap by construction. Light tiers
also nudged (semantic L 0.60 -> 0.64). Final adjacent grayscale gaps: light 1.74 / 1.48 /
1.55; dark 1.61 / 1.50 / 1.50; high-contrast 1.74 / 1.60 / 1.46. The single residual is
HC temporal<->declared at 1.46 (the two low-chroma warm-neutral tiers compressed near
white against the HC near-black ground); left intact per the reviewer because tier
identity's primary channel is shape (solid/dotted/haze line treatment in edgeMeshes), so
identity survives the 0.04 shortfall. All tier+state hues stay above their contrast floor
against the scene canvas in every theme.
