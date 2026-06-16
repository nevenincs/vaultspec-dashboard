---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S22'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---




# Build the CodeViewer component taking {path, text, language_hint}, picking the grammar via the shared hook, rendering highlighted lines with line numbers and a monospace path header

## Scope

- `frontend/src/app/viewer/CodeViewer.tsx`

## Description

- Build the CodeViewer taking the tiers-derived ContentView, picking the grammar via the shared useTokenLines hook (added to the highlighter hook: per-line token arrays through the same singleton + grammar registration), and rendering highlighted lines with a line-number gutter and a monospace path header plus a language badge.

## Outcome

The viewer renders the path header, language badge, and line-numbered highlighted lines; the component test confirms the header, badge, and line numbers.

## Notes

None.
