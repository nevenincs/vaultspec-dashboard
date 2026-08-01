---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:b9dd88f9b30c553847ed2c2530282599759fbdcbbd41e53e57da79d94c71136c'
step_id: 'S13'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# Update the served policy projection call to decide_changeset_approval to drop the removed session_override argument

## Scope

- `engine/crates/vaultspec-api/src/authoring/projections/mod.rs`

## Description

- Dropped the removed `session_override` argument (previously always `None`) from the `decide_changeset_approval` call inside the `policy_decision` helper that backs the served `ProposalProjection.policy` field.

## Outcome

Compiles clean under `cargo clippy -p vaultspec-api --all-targets --no-deps` (zero warnings).

## Notes

None.
