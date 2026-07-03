---
tags:
  - '#exec'
  - '#rag-integration-hardening'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S15'
related:
  - "[[2026-07-03-rag-integration-hardening-plan]]"
---

# File the Tier-3 rag coordination note asking for machine-wide aggregate storage totals on /storage/survey and the vault-collection-name descriptor on /readiness (the blake2b sunset trigger), and close the open rag-console-review step that mandates it

## Scope

- `coordination note (rag sibling) + .vault/plan/2026-07-02-rag-console-review-plan.md`

## Description

- Discovered the house pattern: the `2026-06-26-rag-service-management-reference`
  document is the established cross-repo contract and asks record for vaultspec-rag.
- Confirmed the vaultspec-rag sibling repo (`vaultspec-rag-worktrees/main`) has no
  `.vault/` asks convention; applied the dashboard-side reference-doc fallback per
  the ADR D5 directive.
- Scaffolded `2026-07-03-rag-integration-hardening-reference` as the formal
  Tier-3 coordination ask document (two asks, see below).
- Authored Ask 1 (RCR-002, /storage/survey aggregate totals): requests
  `total_points`, `total_footprint_bytes`, `total_live_count`, `total_orphaned_count`
  as server-side pre-truncation aggregates, so `StorageRollup` is exact rather
  than a sum over the bounded 64-namespace slice; names the consuming engine site
  and interim truncation-honest behaviour.
- Authored Ask 2 (RCR-003, /readiness vault-collection-name, blake2b sunset):
  requests the vault collection name or namespace prefix be advertised on
  `/readiness` or `/storage/survey`, which retires the sanctioned blake2b-6
  recompute in `vault_collection_name` and closes the exception clause in
  `rag-data-rides-the-codified-contract-not-the-qdrant-shape`; names the
  consuming site and honest-degrade interim.
- Added related links to the reference doc for the audit, ADR, and the existing
  `rag-service-management-reference`.
- Scaffolded an ADR stub for `rag-console-review` to satisfy the vaultspec
  lifecycle requirement for exec creation on that audit-driven feature.
- Closed rag-console-review P02.S05 via `vault plan step check`.
- Scaffolded the rag-console-review P02-S05 exec record and authored its body.

## Outcome

The Tier-3 coordination asks for both RCR-002 (machine-wide storage aggregates)
and RCR-003 (vault collection name on `/readiness`) are persisted as a vault
reference document (`2026-07-03-rag-integration-hardening-reference`). The
rag-console-review P02.S05 step is closed. Both plan steps are closed via the CLI.

## Notes

No source files were modified; this step is documentation and vault-record only.
The vaultspec-rag sibling has no native `.vault/` ask convention; persistence in
this repo's vault follows the `rag-service-management` house pattern. A minimal
ADR stub for `rag-console-review` was required to unblock exec record scaffolding
on that audit-driven feature.
