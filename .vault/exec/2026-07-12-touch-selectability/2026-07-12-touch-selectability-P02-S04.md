---
tags:
  - '#exec'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S04'
related:
  - "[[2026-07-12-touch-selectability-plan]]"
---

# Route the whole-viewer vault-doc context-menu hijack through the selection guard so selected prose keeps its native menu

## Scope

- `frontend/src/app/viewer/MarkdownDocView.tsx`

## Description

- Import the shared `guardedContextMenu` helper.
- Wrap `onDocContextMenu` with it so a live text selection over the prose keeps the
  native selected-text menu instead of the `vault-doc` app menu.

## Outcome

The whole-viewer right-click hijack now yields to an active selection intersecting the
target, matching D1. No other behavior changed; the unrelated in-flight flex-wrapper
edit near the editor textarea was left untouched.

## Notes
