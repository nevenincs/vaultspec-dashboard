---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:6f19dc5b426d526269c64e0094996c5309ebdfa7d50cb70ae4469ac3072f011b'
step_id: 'S04'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# Drop the trailing None origin_author argument from the run_authorization call in the agent tool dispatch path

## Scope

- `engine/crates/vaultspec-api/src/authoring/http/handlers3.rs`

## Description

- Removed the trailing `None` origin_author argument from the `run_authorization` call in the agent tool execute dispatch path, matching S03's new signature.

## Outcome

Compiles clean.

## Notes

None.
