---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S03'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---

# Remap the existing chrome and scene var() consumers onto the new semantic role tokens, keeping every current --color-* custom property resolving so no consumer breaks

## Scope

- `frontend/src/styles.css`

## Description

- Remap the existing chrome and scene custom-property consumers onto the new semantic tier without renaming any public token.
- Alias the chrome-only public names (paper, paper-raised, paper-sunken, ink-faint, rule-strong, accent, accent-subtle, accent-text, focus, state-complete, state-archived, state-live, diff) onto semantic roles via a single-hop var() so a theme flip of the semantic tier reaches them.
- Keep the scene-read public names (canvas-bg, ink, ink-muted, rule, the four tier hues, state-active/stale/broken) as literal hex emitted from the same ramp, because the scene readers parse hex.
- Verify no public token name changed, so the 241 chrome utility usages across 24 files and the four scene reader files keep resolving.

## Outcome

Every public `--color-*` token the codebase already consumed still resolves; the internal architecture beneath those names was rebuilt while the names were preserved. Chrome tokens follow the semantic tier through a var() hop; scene tokens are literal hex.

## Notes

This was the highest-blast-radius constraint of the wave: a single renamed token would have silently broken either a chrome utility or a scene getComputedStyle read. The names were treated as a frozen interface.
