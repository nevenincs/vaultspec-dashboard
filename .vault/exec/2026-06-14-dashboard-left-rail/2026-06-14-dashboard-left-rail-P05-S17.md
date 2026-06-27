---
tags:
  - '#exec'
  - '#dashboard-left-rail'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S17'
related:
  - "[[2026-06-14-dashboard-left-rail-plan]]"
---

# Run the feature-scoped lint, test, and vault-check gates to green

## Scope

- `frontend/src/app/`

## Description

- Run the feature-scoped gates: frontend eslint, prettier format:check, tsc -b typecheck, and vitest; plus vault check all.
- Distinguish owner failures from peer breakage.

## Outcome

Lint, format, typecheck, and the full frontend vitest suite (865 passed, 9 pre-existing skips, 0 failed) are green. Vault check's single error is peer-owned, outside this feature.

## Notes

Per full-tree-gate-must-distinguish-owner: the one vault-check error is `2026-06-14-worktree-parse-performance-adr` (a peer document, not this feature); recorded and left to its owning campaign, not patched.
