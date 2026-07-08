---
tags:
  - '#exec'
  - '#distribution-channels'
date: '2026-07-08'
modified: '2026-07-08'
step_id: 'S04'
related:
  - "[[2026-07-08-distribution-channels-plan]]"
---

# gitignore the staged crate assets directory

## Scope

- `.gitignore`

## Description

- Gitignore `engine/crates/vaultspec-api/assets/` beside the engine target dir with a comment naming it a build product

## Outcome

`git check-ignore` confirms the staged index.html is ignored.

## Notes

- None.
