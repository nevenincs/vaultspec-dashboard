---
tags:
  - '#exec'
  - '#rag-service-management'
date: '2026-06-26'
modified: '2026-06-26'
step_id: 'S12'
related:
  - "[[2026-06-26-rag-service-management-plan]]"
---

# Add bounded stores query hooks and types for the rag-ops state surface

## Scope

- `frontend/src/stores/server/ragControl.ts`

## Description

- Add the tolerant wire types `RagStorageNamespace` / `RagStorageRollup` / `RagOpsStateEnvelope` / `RagCollectionHealthEnvelope` mirroring the engine's serialized rag-ops shapes.
- Add the `ragControlKeys.opsState` and `ragControlKeys.collectionHealth` cache keys (scope- and collection-folded).
- Add the bounded read hooks `useRagOpsState(scope)` (the aggregated size/state snapshot) and `useRagCollectionHealth(scope, collection)` (the gated Tier-2 drill-in, enabled only with a non-empty collection), each with `READ_GC_MS` gcTime and scope-gated enablement, degrading via the tiers block like every sibling read.

## Outcome

Done. The app layer can consume the Rust-aggregated size/state and the gated Qdrant-native health through bounded stores hooks (the W04 console's data seam). `npx tsc --noEmit` is exit 0. W02 (Rust diagnostics/size-state backend) is complete.

## Notes

Consistent with the established `useRagServiceState`/`useRagWatcher` read-hook pattern (scope-gated, bounded gcTime, tiers-degraded). The console-side derivation (human-readable bytes, orphan grouping) is deferred to W04 where the view is built; S12 is the typed data seam.
