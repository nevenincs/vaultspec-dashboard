---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-07-12'
step_id: 'S14'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---

# Bind Shiki token colors to the OKLCH semantic token tier so light, dark, and high-contrast are three theme maps with no per-surface color

## Scope

- `frontend/src/app/viewer/highlighterTheme.ts`

## Description

- Define one Shiki theme whose token foregrounds are `var(--color-*)` references to the existing semantic token tier, so light, dark, and high-contrast are three token maps with no per-surface color — the DOM resolves the `var()` chain against the active `[data-theme]`.
- Map TextMate scopes onto the warm low-chroma neutral ramp plus the single accent and the established state/tier hues, honoring warmth-lives-in-tokens — no bespoke syntax-color rainbow.

## Outcome

The token-bound theme repaints on theme switch with no re-tokenization; the probe test confirms the emitted foregrounds reference `var(--color-*)`.

## Notes

None.
