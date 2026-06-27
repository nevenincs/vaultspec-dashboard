---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S23'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---

# Virtualize the line list so a large capped file scrolls cheaply, with no editing affordances

## Scope

- `frontend/src/app/viewer/CodeViewer.tsx`

## Description

- Virtualize the line list with a self-contained fixed-row-height windowed renderer: compute the visible line range from scrollTop + a measured viewport height (ResizeObserver), render only that window (plus overscan) absolutely positioned within a full-height spacer, with a sticky line-number gutter.
- No editing affordances — the viewer is display-only.

## Outcome

A large (byte-capped) file scrolls cheaply rendering only the visible window; the component test confirms no textbox (display-only).

## Notes

No virtualization library exists in the codebase; a lightweight windowed renderer was implemented in-component rather than adding a dependency, consistent with the byte-capped file bound.
