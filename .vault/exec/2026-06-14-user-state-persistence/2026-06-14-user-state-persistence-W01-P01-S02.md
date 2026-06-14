---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S02'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---




# register the new crate in the workspace members

## Scope

- `engine/Cargo.toml`

## Description

- Add a `vaultspec-session` entry to the workspace `[workspace.dependencies]` table in `engine/Cargo.toml`, path-only as the sibling internal crates are declared.
- Confirm the crate builds via the existing `members = ["crates/*"]` glob.

## Outcome

The workspace now exposes `vaultspec-session` as a path dependency so `vaultspec-api` can consume it in W02 without re-declaring the path. The crate compiles cleanly under the workspace lints. No inference crate was touched.

## Notes

None. The members glob already discovered the crate in S01; this entry only wires the consumable dependency name for later waves.
