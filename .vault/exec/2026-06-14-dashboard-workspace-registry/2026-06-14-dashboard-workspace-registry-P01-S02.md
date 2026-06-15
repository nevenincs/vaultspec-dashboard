---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S02'
related:
  - "[[2026-06-14-dashboard-workspace-registry-plan]]"
---




# Implement the durable workspace-registry table with best-effort open-or-heal in the user-state store

## Scope

- `engine/crates/vaultspec-session/src/store.rs`

## Description

- Confirm the registry table participates in the existing best-effort open-or-heal: `open_or_heal` wipes the file and its WAL/SHM siblings on any open or schema failure, and `ensure_schema` recreates the registry table on the fresh file.
- Add a store-level test that overwrites the db with garbage, heals, and asserts the recreated `workspace_registry` table is queryable and empty.

## Outcome

A corrupt or shape-mismatched store recreates an empty, usable registry table alongside the session and settings tables, matching the prototype best-effort posture: there is nothing precious to safeguard, so a corrupt registry resets to no roots and the launch workspace is re-auto-registered on the next boot.

## Notes

No new heal mechanism was needed; the registry table rides the existing single open-or-heal path that already wipes-on-any-failure, so adding the table to the DDL was sufficient for full heal coverage.
