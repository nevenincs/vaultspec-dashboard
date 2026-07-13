---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S13'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---

# Define the diff added/removed green/red as high-contrast sacred tokens that override warmth even in the warm theme

## Scope

- `frontend/src/styles.css`

## Description

- Define the diff added/removed green and red as sacred high-contrast tokens that override warmth even in the warm theme.
- Author light and dark diff renderings at high chroma and contrast, and a high-contrast theme rendering that lifts them further, so diff legibility never yields to the warm ground.

## Outcome

Diff add/remove is contrast-proven at or above 4.5:1 in every theme (S17) and is the one place warmth is explicitly overridden, per the ADR's sacred-diff rule (layer 3).

## Notes

The diff tokens are primitives aliased by the public diff-add/diff-remove names and remapped per theme; they are deliberately outside the single-accent discipline because diff semantics are not warmth-governed.
