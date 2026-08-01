---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:36611b61932007d39ad15ec55e17700ba2db3818f46196e1523ce01a066153a4'
step_id: 'S05'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# Drop the trailing None origin_author argument from the route layer run_authorization call

## Scope

- `engine/crates/vaultspec-api/src/authoring/http/mod.rs`

## Description

- Removed the trailing `None` origin_author argument from the route-layer `run_authorization` call (the standing + delegation authorization floor every mutating route passes through).
- Corrected the surrounding comment: the document-scope guard runs in handlers carrying a session scope and drafted targets; there is no longer an origin-author dimension to mention.

## Outcome

Compiles clean; the route-layer floor still refuses an unregistered, deactivated, or stale-delegated actor on every mutating route with no bypass.

## Notes

None.
