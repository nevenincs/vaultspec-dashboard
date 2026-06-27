---
tags:
  - '#exec'
  - '#node-visual-richness'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S11'
related:
  - "[[2026-06-14-node-visual-richness-plan]]"
---

# declare per-theme literal-hex status tokens and the scene reader

## Scope

- `frontend/src/styles.css`

## Description

- Declare the three new scene-read status tokens (`--color-status-provisional`, `--color-status-graded`, `--color-status-tiered`) as literal hex in the static color namespace and in all three theme blocks (light, dark, high-contrast), keeping them warm-neutral and never a `var()` chain.
- Reuse the existing `--color-state-active`/`--color-state-archived` tokens for affirmed/retired/negated where the status-token map already points at them, so only the three genuinely-new names are added.

## Outcome

The scene reader resolves each status tint as literal `#rrggbb` per theme, satisfying the literal-hex scene-seam contract that the canvas `getComputedStyle` readers depend on. Diff red is untouched and no second accent was introduced; warmth stays in the token tier.

## Notes

The tokens that `stampToken` already maps to `--color-state-*` were deliberately not duplicated; only the provisional/graded/tiered names are new, defined once in the static block and overridden per theme.
