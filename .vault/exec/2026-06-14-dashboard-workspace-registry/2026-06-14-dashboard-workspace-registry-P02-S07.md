---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S07'
related:
  - "[[2026-06-14-dashboard-workspace-registry-plan]]"
---

# Add the optional workspace= parameter to /map defaulting to the active workspace with unchanged single-workspace behaviour

## Scope

- `engine/crates/vaultspec-api/src/routes/registry.rs`

## Description

- Add the optional `workspace=` query parameter to the `/map` handler, resolving the launch root read-only through a registry helper: absent or `active` selects the active workspace (falling back to the launch workspace when no selection exists), a registered id selects that root, and an unknown id 400s honestly with the tiers block.
- Keep the `/map` handler in `query.rs` with its existing tests; the workspace-resolution helper lives in `routes/registry.rs` per the plan's file intent.

## Outcome

The single-workspace behaviour is the unchanged `workspace=active` default — the existing `/map` tests pass unmodified — and `/map?workspace=<id>` lists a chosen registered root. A route test asserts the unchanged default plus the unknown-workspace 400 carrying the tiers block.

## Notes

The default falls back to the launch workspace rather than 400 on a torn registry, so `/map` never regresses to an error when no active workspace has been selected yet.
