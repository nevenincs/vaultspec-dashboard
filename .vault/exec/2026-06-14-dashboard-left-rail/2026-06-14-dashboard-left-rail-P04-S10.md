---
tags:
  - '#exec'
  - '#dashboard-left-rail'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:5b5296126b72cd6d47719bdf9d1ce822c42afaf2e983c4f87413b013670b86ea'
step_id: 'S10'
related:
  - "[[2026-06-14-dashboard-left-rail-plan]]"
---

# Enforce that every rail interaction emits only scope-select, node-select, or view-affordance intent through stores

## Scope

- `frontend/src/app/left/`

## Description

- Enforce the single navigation law in `LeftRail`: every interaction resolves to scope-select (workspace/worktree), node-select (vault doc / code file), or a view-local affordance (collapse, mode toggle, filter, expand) emitted through stores.
- No rail-local fetch, no node-shape minting, no raw tiers read in any composed component.

## Outcome

Every rail interaction emits only the three sanctioned intents through stores; committed and guarded by the read-only render assertion.

## Notes

Composition only: each hosted control owns its own stores hooks; the rail composes them.
