---
tags:
  - '#exec'
  - '#rag-console-review'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S05'
related:
  - "[[2026-07-02-rag-console-review-plan]]"
---

# RCR-002 (Tier-3): file the rag coordination ask for machine-wide aggregate storage totals on /storage/survey

## Scope

- `coordination note (rag sibling)`

## Description

- Searched the vault for established coordination-ask conventions; found the
  existing `2026-06-26-rag-service-management-reference` as the house pattern.
- Confirmed the vaultspec-rag sibling repo (`vaultspec-rag-worktrees/main`) has
  no `.vault/` asks convention.
- Scaffolded a new vault reference document for the `rag-integration-hardening`
  feature to house both Tier-3 asks: `2026-07-03-rag-integration-hardening-reference`.
- Authored Ask 1 (RCR-002): machine-wide aggregate storage totals
  (`total_points`, `total_footprint_bytes`, `total_live_count`, `total_orphaned_count`)
  on `/storage/survey`, naming the consuming engine site
  (`rag-client/src/control.rs` `derive_storage_rollup`) and the interim honest-degrade
  (truncated flag + "≥ X" console annotation).
- Authored Ask 2 (RCR-003 sunset trigger): vault collection name or namespace prefix
  advertised on `/readiness` or `/storage/survey`, naming the consuming engine site
  (`rag-client/src/vectors.rs` `vault_collection_name`) and the sunset clause that
  retires the sanctioned blake2b exception on delivery.
- Added related links to the reference doc: `2026-07-02-rag-console-review-audit`,
  `2026-07-03-rag-integration-hardening-adr`, and
  `2026-06-26-rag-service-management-reference`.
- Scaffolded an ADR stub for `rag-console-review` to satisfy the vaultspec exec
  lifecycle requirement (audit-driven feature; the audit IS the decision record).
- Scaffolded this exec record and closed this step via CLI.

## Outcome

Both Tier-3 coordination asks are persisted as
`2026-07-03-rag-integration-hardening-reference` in the dashboard vault. The ask
is issue-ready for the vaultspec-rag team; GitHub filing is pending owner
go-ahead. The rag-integration-hardening ADR D5 and the rag-console-review audit
RCR-002/RCR-003 are now fully closed on the dashboard side.

## Notes

The vaultspec-rag sibling repo has no `.vault/` ask convention, so the house
pattern of the `rag-service-management` reference doc was followed: the ask is
persisted as a vault reference document in this repo.

A minimal ADR stub (`2026-07-03-rag-console-review-adr`) was scaffolded to satisfy
the vaultspec lifecycle check that blocks exec creation without an ADR. The
`rag-console-review` feature is audit-first; the audit itself is the decision
record, and the ADR notes this explicitly.
