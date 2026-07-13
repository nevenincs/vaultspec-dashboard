---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-12'
step_id: 'S227'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Implement review count rollups and per-document activity projections deferred from the Increment 1 review-projection subset

## Scope

- `engine/crates/vaultspec-api/src/authoring/projections.rs`

## Description

- Add backend-served corpus review count DTOs for latest changeset status and
  approval queue-state rollups.
- Add a bounded per-document activity projection with stable document identity
  keys, durable ledger sequence ordering, child-operation metadata, and embedded
  proposal projection state.
- Extend the proposal list projection with full-corpus counts without deriving
  counts from the bounded list page.
- Normalize activity identities for existing documents, provisional creates,
  rename targets, and materialized results.
- Keep activity as a separate projection function rather than attaching
  all-document activity to the proposal-list response.
- Run focused format and compile verification.

## Outcome

`S227` implemented the W11.P50 projection surface in `projections.rs`.

The proposal list now carries `ReviewCountProjection`, computed from latest
durable changeset rows and latest durable approval rows across the full corpus.
The count read is independent of the bounded proposal page, so a truncated list
does not produce truncated counts.

The new per-document activity projection is a bounded read with `items`, `cap`,
and `truncated`. It accepts a backend-issued document activity key and returns
items ordered by latest durable ledger sequence. Each item carries the matching
document identity, child key, target order, operation kind, ledger sequence, and
the existing `ProposalProjection` so status, validation, approval/stale state,
policy decision, conflict, eligibility, actor/origin actor, summary, and
rollback availability remain backend-served.

Document identity grouping is explicit:

- Existing documents use `existing:{scope}:{node_id}`.
- Provisional creates use `provisional:{provisional_doc_id}`.
- Rename targets preserve the reviewed/source identity and also expose a
  `rename_target:{proposed_node_id}` identity.
- Materialized results preserve the reviewed/source identity and also expose a
  `materialized:{result_node_id}` identity.

Verification:

- `cargo fmt --manifest-path engine/Cargo.toml --package vaultspec-api`
- `cargo check --manifest-path engine/Cargo.toml -p vaultspec-api`

## Notes

- `vaultspec-rag` was requested and attempted twice during S227 grounding, but
  the MCP transport closed immediately both times. S227 proceeded from the local
  vault and source evidence already gathered in S226.
- The first implementation uses durable latest-row scans for counts and for the
  bounded activity feed. The served activity output is capped and honest, but
  S229 should review whether W11.P50 needs dedicated indexes or child-target
  lookup tables before broader routing/frontend use.
- S228 remains responsible for real-store coverage proving full-corpus counts,
  activity grouping, bounded truncation, ordering, and rebuild behavior.
