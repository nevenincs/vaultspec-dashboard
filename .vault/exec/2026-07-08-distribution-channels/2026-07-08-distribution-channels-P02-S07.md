---
tags:
  - '#exec'
  - '#distribution-channels'
date: '2026-07-08'
modified: '2026-07-08'
body_hash: 'sha256:b99f6fce3ac5fccc5e134bf6a9edbc7330f2c2eb9d132fbf0718618c52b0028d'
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
