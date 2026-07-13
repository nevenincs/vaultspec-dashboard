---
tags:
  - '#exec'
  - '#node-visual-richness'
date: '2026-06-15'
modified: '2026-07-12'
step_id: 'S07'
related:
  - "[[2026-06-14-node-visual-richness-plan]]"
---

# mirror the per-type status in the mock engine and the corpus fixtures

## Scope

- `frontend/src/testing/mockEngine.ts`

## Description

- Add per-type status tables to the corpus fixture mirroring the live engine mapping (adr decision states, plan tiers, audit severities, rule states, feature lifecycle) and emit `status_value`/`status_class` on the feature node, each doc node, and a new per-feature rule node.
- Cycle the tables by feature index so the full stamp matrix is exercised: an accepted ADR, a deprecated/superseded reading, an L2 plan, a high audit, and a superseded rule all appear.
- Verify the mock serves the fields unchanged through its document-granularity spread; extend the live-adapter survival test to assert the status fields survive the client path and that a type with no status machine carries neither field.

## Outcome

The mock now serves the additive status pair byte-for-byte with the live wire, and the adapter survival test proves the fields reach the client through the same path the app uses. No existing mock/stores/scene assertion broke.

## Notes

A dedicated rule node per feature was added (the prior corpus had no rule doc type) so the compound superseded-rule treatment is reachable; its declared edge carries a `binds` derivation and does not perturb the semantic-tier meta-edge derivation.
