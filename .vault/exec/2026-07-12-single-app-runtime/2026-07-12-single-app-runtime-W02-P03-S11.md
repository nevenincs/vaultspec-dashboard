---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S11'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# On attach to a live seat, register and select the resolved workspace through the existing session-state write seam over HTTP when it is not the seat's active one, updating launcher-state last-active on every successful open

## Scope

- `engine/crates/vaultspec-cli/src/cmd/launch.rs`

## Description

- On attach, `select_workspace_on_seat` registers the resolved workspace through the `/session` write seam (`add_workspace`, refusals tolerated), resolves the registered id from `GET /workspaces` by normalized path, then selects it (`active_workspace`).
- Add an inherent `put_json` to rag-client's `LoopbackTransport` (the `/session` seam is PUT; the RagTransport trait stays GET/POST).
- Stamp launcher-state last-active on every successful open.

## Outcome

Second launches attach and point the seat at the caller's project without restarting anything.

## Notes

When registration is refused (unregistrable path) the browser still opens on the seat's current workspace, reported as workspace_selected=false.
