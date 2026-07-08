---
tags:
  - '#exec'
  - '#distribution-channels'
date: '2026-07-08'
modified: '2026-07-08'
step_id: 'S07'
related:
  - "[[2026-07-08-distribution-channels-plan]]"
---

# register the post-announce job in the dist config and regenerate the release workflow

## Scope

- `dist-workspace.toml`

## Description

- Register `post-announce-jobs = ["./scoop-bump"]` in the dist config and regenerate the release workflow through dist

## Outcome

`dist generate` emitted the `custom-scoop-bump` job (`needs: [plan, announce]`, `with: plan: needs.plan.outputs.val`) and `dist plan` passes the staleness check; toml gate green.

## Notes

- None.
