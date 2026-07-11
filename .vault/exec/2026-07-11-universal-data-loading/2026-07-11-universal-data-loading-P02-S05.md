---
tags:
  - '#exec'
  - '#universal-data-loading'
date: '2026-07-11'
modified: '2026-07-11'
step_id: 'S05'
related:
  - "[[2026-07-11-universal-data-loading-plan]]"
---

# Author the kit ActivityIndicator primitive (slim non-blocking bar, indeterminate + determinate modes, sr-only 'Loading data' label, token-only sizing) conforming to state-mode-uniformity and the Figma name-as-contract join

## Scope

- `frontend/src/app/kit/ActivityIndicator.tsx`

## Description

Create `frontend/src/app/kit/ActivityIndicator.tsx`: a dumb kit primitive - slim fixed top pulse bar (`bg-accent`, `animate-pulse-live`, token-only sizing), `role=status` with sr-only `Loading data`, optional determinate rows chip with tabular numerals; renders null when not visible.

## Outcome

Conforms to state-mode-uniformity (UI-only loading, sr-only label) and composes existing token utilities only.

## Notes
