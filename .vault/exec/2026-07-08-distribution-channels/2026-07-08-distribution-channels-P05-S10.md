---
tags:
  - '#exec'
  - '#distribution-channels'
date: '2026-07-08'
modified: '2026-07-08'
step_id: 'S10'
related:
  - "[[2026-07-08-distribution-channels-plan]]"
---

# verify the feature-on build and tests against the staged crate assets, packaged artifact serving standalone

## Scope

- `engine/crates/vaultspec-api`

## Description

- Rebuild the packaged binary through the new staged-assets recipe (`just dev build package`) and serve a clean fixture workspace standalone

## Outcome

Feature-on lib suite 601 green against the staged crate assets; the rebuilt release binary served `/health` 200 and the embedded index with the token bootstrap from a clean directory, then stopped cleanly.

## Notes

- None.
