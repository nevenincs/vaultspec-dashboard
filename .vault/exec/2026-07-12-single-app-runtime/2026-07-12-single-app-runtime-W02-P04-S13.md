---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S13'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# Let serve boot the seat with no resolvable workspace: empty registry mode with honest tiers (no workspace registered stated per component), the SPA served, and every workspace-scoped route answering typed empty rather than erroring

## Scope

- `engine/crates/vaultspec-api/src/lib.rs`

## Description

- Let a SEATED serve with no resolvable vault-bearing workspace boot over the engine-owned bootstrap root (`<app home>/bootstrap`: empty `.vault/` + a one-time `gix::init` scratch repository) instead of failing.
- The bootstrap is never auto-registered and never touches launcher state: an EMPTY `/workspaces` registry is the SPA's first-run signal; all served projections are honestly empty/degraded through tiers.
- Exempt serves (`--no-seat`, `--port 0`) keep the historical fail-loud contract verbatim.

## Outcome

A fresh install double-click boots to a served SPA with an empty registry; verified live and by the boot-matrix suite.

## Notes

The bootstrap git init is an engine-owned-storage exception to never-mutate-git (it is deletable scratch under the app home, no user repository involved) — flagged for review.
