---
tags:
  - '#exec'
  - '#a2a-orchestration-edge'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S18'
related:
  - "[[2026-07-17-a2a-orchestration-edge-plan]]"
---

# Replace active-run metadata scans with persisted bounded indexed selectors and prove an index-backed, stable large-history query plan

## Scope

- `src/vaultspec_a2a/database/`
- `src/vaultspec_a2a/control/run_discovery_service.py`

## Description

- Persist canonical workspace, bounded feature, and active-lifecycle selectors at the thread write seam.
- Backfill the projection through a bounded migration and add covering newest-first indexes.
- Replace metadata and filesystem scans with one narrow indexed query capped at `limit + 1`.
- Exclude malformed lifecycle and run identifiers before they can consume the bounded result window.
- Prove the production statement remains index-backed and memory-bounded over 100,000 durable history rows.

## Outcome

Active-run discovery now scales with the requested result bound rather than total thread history. The migration suite passed 17 tests, the production live contract passed 2 tests, and the 100,000-row proof used the workspace-feature covering index without a table scan or temporary sort while remaining below the declared latency and five-megabyte allocation ceilings.

## Notes

The live contract initially exposed invalid overlength run identifiers consuming the limited database window before service validation. The production query now applies that identity bound before limiting, and the recovered binding contract passes.
