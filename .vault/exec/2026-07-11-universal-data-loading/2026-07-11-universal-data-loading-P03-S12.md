---
tags:
  - '#exec'
  - '#universal-data-loading'
date: '2026-07-11'
modified: '2026-07-11'
step_id: 'S12'
related:
  - "[[2026-07-11-universal-data-loading-plan]]"
---

# Codify the mount-gating visibility law (heavy data hooks live only under components that render their data, no visibilityState-enabled queries) as a project rule source and sync

## Scope

- `.vaultspec/rules/ + vaultspec-core sync`

## Description

Author `.vaultspec/rules/data-loading-activity.md` codifying: mount-gating as the canonical visibility law (no visibilityState-enabled queries, with the one sanctioned pause surface named), the one activity plane, mandatory drain-progress reporting for cursor walks, and honest partial listings. Propagated with `vaultspec-core sync` (rule registered into the provider mirrors).

## Outcome

Rule live in CLAUDE.md rule set.

## Notes
