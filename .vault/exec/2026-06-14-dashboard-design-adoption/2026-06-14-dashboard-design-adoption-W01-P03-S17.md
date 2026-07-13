---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S17'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---

# Contrast-prove every text and border token against each theme (warm ground shifts effective contrast), recording the per-theme ratios

## Scope

- `frontend/src/styles.css`

## Description

- Contrast-prove every text and border token against its ground in each theme, accounting for the warm ground shifting effective contrast.
- Compute WCAG 2.1 ratios from the OKLCH sRGB renderings for light, dark, and high-contrast, against each theme's actual ground.
- Record the per-theme ratios in a contrast-proof comment block at the foot of the token file, and document the deliberately-quiet rule tokens that sit below the non-text floor by design.

## Outcome

Every load-bearing pair is proven: body text at or above 4.5:1, large/UI text and the focus ring at or above 3:1, in light and dark; the high-contrast theme raises every pair to at least 4.5:1. The full matrix is recorded in the token file. The only sub-floor tokens are the felt-not-seen rule/rule-strong dividers, documented as intentional non-load-bearing borders whose load-bearing counterpart (the focus ring) clears 3:1 in every theme.

## Notes

Targets met everywhere except the deliberately-quiet rule tokens (light rule/paper ~1.3:1, dark ~1.7:1), which the ADR's felt-not-seen border discipline requires; high-contrast lifts them to visible separators (4.18:1 / 7.61:1). No load-bearing token missed its floor.

## Revision (design review, batch 1)

- MEDIUM-1: the high-contrast `--color-canvas-bg` was a cold blue-dominant hex
  contradicting its own warm-hue comment and desyncing from the HC semantic ground.
  Re-emitted as the warm rendering just below the HC semantic surface base, so chrome
  ground and scene ground agree and stay warm.
- LOW-1: the dark scene-read contrast-proof rows were documented against
  `--color-paper` (the chrome ground) but the scene composites on `--color-canvas-bg`
  (slightly darker). Re-labelled all dark and high-contrast tier+state rows as proven
  against the canvas ground (they still clear floor) and re-derived the full matrix for
  the revised tier/state values. Added the grayscale-gap section recording the
  per-theme adjacent-tier ratios (MEDIUM-2).
