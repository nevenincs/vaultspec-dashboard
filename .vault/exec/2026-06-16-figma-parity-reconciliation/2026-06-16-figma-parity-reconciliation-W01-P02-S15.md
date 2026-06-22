---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S15'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---




# Carry the tiers degradation block on the historical text-diff route success and error envelopes through the shared helper

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Confirm and document that the historical-diff route constructs its success body through the shared `envelope` helper (which attaches the per-tier degradation block) and degrades every error path through `api_error` (which always attaches the tiers block), so tiers ride on both success and error envelopes.
- Add a dedicated test asserting the tiers block is present on the historical-diff SUCCESS envelope and on the ERROR envelope (a missing rev is a tiers-bearing 400 before any subprocess).

## Outcome

The bounded historical text-diff route carries the tiers degradation block on both its success and error envelopes through the shared envelope helper, with no hand-built response body. The dedicated test proves both paths. `cargo fmt --check` and `cargo clippy -D warnings` are clean on the touched crate.

## Notes

The tiers carriage is structural: the route shares the single `envelope`/`api_error` construction every front door uses, so it cannot ship a tiers-less body. The route logic landed in S14; this Step closes the tiers obligation and its verification.
