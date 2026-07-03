---
tags:
  - '#exec'
  - '#rag-integration-hardening'
date: '2026-07-03'
modified: '2026-07-03'
related:
  - "[[2026-07-03-rag-integration-hardening-plan]]"
---

# `rag-integration-hardening` `P05` summary

Closed audited residuals: extended version-tolerant --json retry to lifecycle verbs, offloaded the reprobe loop, filed the Tier-3 rag coordination asks, and recorded the stop_failed tiers decision.

- Modified: `engine/crates/vaultspec-api/src/routes/ops.rs`
- Created: `2026-07-03-rag-integration-hardening-reference` (vault coordination asks)
- Created: `2026-07-02-rag-console-review-adr` (ADR stub for related feature)
- Modified: `.vault/plan/2026-07-02-rag-console-review-plan.md`

## Description

Phase P05 closes five audited lifecycle residuals as ride-alongs. S13 extends the version-tolerant --json retry (exit-2 usage-error detection + plain retry) from server-start to server-status, server-doctor, and server-install, closing the T1-R1 residual with new unit-testable helper functions. S14 wraps `reprobe_rag_until_running` probes under `rag_offload` so blocking network I/O runs on the Tokio pool, closing T1-R2. S15 files two Tier-3 coordination asks in a new reference document: RCR-002 for machine-wide aggregate storage totals on `/storage/survey` and RCR-003 for vault-collection-name descriptor on `/readiness` (the blake2b-6 recompute sunset trigger); also closes the related rag-console-review P02.S05 step via a minimal ADR stub. S16 adds a code comment recording the stop_failed tiers decision (ADR D5 / T1-R3). All four steps land in one commit per the house process-deviation note in the audit. Engine suite green with fmt and clippy clean.
