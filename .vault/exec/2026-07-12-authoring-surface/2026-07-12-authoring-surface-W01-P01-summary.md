---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# `authoring-surface` `W01.P01` summary

All four steps complete (S01-S04), adversarially reviewed APPROVED with zero
blocking findings, plus three review-response hardening items landed in-phase.

- Modified: `engine/crates/vaultspec-api/src/authoring/core_adapter.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/apply.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/operations.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/proposal.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/api.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/ledger.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/policy.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/direct_write.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/transitions.rs` (guard test)
- Modified: `engine/crates/vaultspec-api/src/authoring/http.rs` (one shared
  error arm, owned and confirmed by the P02 lane)

## Description

The plan-step tick now rides the ledgered authoring path end to end, exactly as
ADR decision D1 requires. Two new core capabilities invoke the canonical
`vault plan step check` / `uncheck` verbs through the bounded subprocess seam
(8 MiB output cap, 120 s timeout, positional argv). A new set-plan-step-state
changeset operation kind materializes like rename, rides a direct-only
self-approved changeset with provenance, and is accepted on the direct-writes
route with no route change (the handler is generic over the request shape).

The two honest ADR constraints landed as designed. The missing core-side
expected-blob-hash fence is substituted by the engine-side stale-base pre-check
plus the refreshed conflict re-check just before apply; the residual race is
only the stated preflight-to-invoke window, resolved fail-closed by the
core-authoritative post-verify, which re-reads the resulting step state through
the same plan-structure parser the projection serves from (never a blob
compare). The status-vocabulary confirmation found no widening needed: a real
flip reports updated, an idempotent re-tick reports unchanged (proven Applied
end to end by a dedicated test), and refusals report failed.

Review verdict: APPROVED, no CRITICAL/HIGH. The one MEDIUM (the rollback
eligibility gate excluding plan ticks rested on an untested absence) was
resolved with a regression guard test locking rollback-unavailable for plan
ticks - the whole-document preimage restore would clobber concurrent ticks, so
V1 deliberately has no plan-tick rollback; the check/uncheck inverse is a named
follow-on. Both LOW items (doc-comment clarification, idempotent-retick
coverage) also landed. Gates: fmt, clippy all-targets, and the authoring lib
suite (537 tests at review time) all green; four real-core plan-tick
integration tests pass, no mocks.
