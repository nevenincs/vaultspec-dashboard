---
tags:
  - '#plan'
  - '#rag-console-review'
date: '2026-07-02'
modified: '2026-07-03'
tier: L2
related:
  - '[[2026-07-02-rag-console-review-audit]]'
---

# `rag-console-review` plan

### Phase `P01` - Directly implementable

Move blocking rag HTTP reads off async workers, add storage-truncation honesty, and remove the stale whitelist comment and the Evict disabled-lie.

- [x] `P01.S01` - RCR-001: wrap the brokered rag HTTP read chains (Tier-1 verbs, Tier-2 collection-health, status/start probes, embeddings gate+scroll) in spawn_blocking so blocking std::net TCP I/O never pins Tokio async workers; `engine/crates/rag-client/ + vaultspec-api rag ops`.
- [x] `P01.S02` - RCR-002 (implementable half): add a truncated flag to StorageRollup and a console annotation so the 64-namespace-slice rollup never silently undercounts; `engine/crates/ (StorageRollup) + frontend RagOpsConsole`.
- [x] `P01.S03` - RCR-004: correct the stale ops_rag server-start --json comment and remove the dead unreachable server-start/server-stop rows from RAG_CLI_WHITELIST; `engine/crates/vaultspec-api rag ops`.
- [x] `P01.S04` - RCR-005: give console Evict a stated disabled reason (or enable it) when rag omits ref_count, removing the permanently-disabled-lie; `frontend RagOpsConsole`.

### Phase `P02` - Decision-gated and coordination

The rag machine-wide storage-total ask and the blake2b naming-scheme curation call.

- [x] `P02.S05` - RCR-002 (Tier-3): file the rag coordination ask for machine-wide aggregate storage totals on /storage/survey; `coordination note (rag sibling)`.
- [x] `P02.S06` - RCR-003: curation decision on the blake2b vault_collection_name recompute - amend rag-data-rides-the-codified-contract to record the ADR-sanctioned exception, or re-source the name from the survey; `.claude/rules/ (arch-reviewer)`.

## Description

## Steps

## Parallelization

## Verification
