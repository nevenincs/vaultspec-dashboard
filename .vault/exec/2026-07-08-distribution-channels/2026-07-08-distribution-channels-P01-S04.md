---
tags:
  - '#exec'
  - '#distribution-channels'
date: '2026-07-08'
modified: '2026-07-08'
body_hash: 'sha256:7ee44e18654051087782c15e1e3566a795754b3b154ee32ce1271130ddd6d25c'
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
