---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S29'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Add the re-derivability test proving a full index from a deleted cache converges to the identical graph

## Scope

- `engine/crates/engine-graph/tests/`

## Description

- Add the re-derivability integration test: cold index (populates cache), warm re-index (100% cache hits), delete the store database, re-index - and assert byte-equal canonical snapshots plus id stability across all runs.

## Outcome

ADR D8.2 proven mechanically: persistence is cache, not truth; deleting it loses nothing but warm-up time.

## Notes

None.
