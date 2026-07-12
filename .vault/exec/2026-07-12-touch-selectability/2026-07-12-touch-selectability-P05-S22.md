---
tags:
  - '#exec'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S22'
related:
  - "[[2026-07-12-touch-selectability-plan]]"
---




# Run the full frontend lint gate and the complete vitest suite and reconcile any regression to green

## Scope

- `frontend/`

## Description

- Run the full frontend lint gate and the complete live-wire vitest suite; reconcile the two regressions (stale exact-class assertions in the worktree-picker and code-tree row view tests, which had not learned the D2 `select-text` insertion)

## Outcome

Gate exits 0 (eslint, prettier, tsc, px-scan, figma names); full suite 316 files green after the assertion updates. Review revision (HIGH) landed before closure: the disclosure now covers every menu-online surface, verified by the new D3 fence.

## Notes

