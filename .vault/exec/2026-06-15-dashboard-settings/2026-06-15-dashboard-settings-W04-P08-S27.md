---
tags:
  - '#exec'
  - '#dashboard-settings'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S27'
related:
  - "[[2026-06-15-dashboard-settings-plan]]"
---




# Implement the scope-override affordance: global versus active-scope, inheriting-global cue, and clear-override or reset-to-default

## Scope

- `frontend/src/app/settings/SettingsDialog.tsx`

## Description

- Implemented the scope-override affordance for scope-eligible settings: a [Global | This scope] target, an honest provenance note, and a context-aware Match-global / Reset-to-default action.

## Outcome

Per-scope overrides with labels that match their effect.

## Notes

The reset/clear semantics were corrected in the review revision (the PUT-only backend has no delete, so 'Match global' writes the inherited value).
