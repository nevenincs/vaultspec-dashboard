---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S01'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---

# Author the intent-free OKLCH primitive lightness/chroma/hue ramps (neutral, accent, tier, and state hue families) as the base ramp tokens

## Scope

- `frontend/src/styles.css`

## Description

- Author the intent-free OKLCH primitive ramps as the base of the token architecture in the Tailwind `@theme static` color namespace.
- Build a warm neutral ramp at a fixed warm hue and near-zero chroma across seventeen lightness stops, spanning pure white down to a warm near-black, to serve as the ground and ink for every theme.
- Build a muted earthy-green accent ramp at a single fixed hue with light-ground, dark-ground, and subtle-background stops.
- Build the four tier hues and the diff hues as primitive stops, each at fixed lightness and chroma so a later semantic alias never has to invent a value.
- Keep every primitive intent-free: a primitive names only lightness, chroma, and hue, never a role.

## Outcome

The primitive ramp tier exists as the bottom layer of the token file. Primitives carry no purpose and are not read by chrome or scene directly; the semantic tier aliases them. The warm hue and low chroma give the human-warmth signature its token-level home (ADR layer 9) without any decoration.

## Notes

The OKLCH-to-sRGB renderings of each primitive were computed off-line so the scene-read hex surface could be derived from the same ramp; the conversion is re-derivable (OKLab to linear sRGB to gamma). No primitive is consumed directly by a utility or a getComputedStyle read.
