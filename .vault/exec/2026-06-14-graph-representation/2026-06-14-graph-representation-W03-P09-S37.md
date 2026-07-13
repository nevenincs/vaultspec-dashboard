---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S37'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---

# Add a pure composition sequencer (lens re-query then mode re-layout) module

## Scope

- `frontend/src/stores/view/composition.ts`

## Description

## Outcome

Added `composition.ts`: the pure lens x mode sequencer (lens change -> requery then relayout; mode change -> relayout only; nothing -> []). Owns no React and no fetch; Stage drives the actual re-query/command.

## Notes
