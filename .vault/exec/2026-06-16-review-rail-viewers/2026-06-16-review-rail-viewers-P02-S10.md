---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S10'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---

# Expose a content selector that derives degraded/offline state from the tiers block, never from a transport error

## Scope

- `frontend/src/stores/server/selectors.ts`

## Description

- Add the `ContentView` shape and `deriveContentView`/`useContentView` selector deriving degraded/offline state from the served `tiers` block (the structural tier the content read resolves through), reading the FRESH error envelope's tiers over a stale held-success block, never from a bare transport error.
- Distinguish a tiers-less transport fault (errored) from a tiers-bearing degradation (degraded), and blank the text while degraded/errored so a stale body is never shown as current.

## Outcome

The viewers read interpreted loading/degraded/errored/truncated/content state, never the raw tiers block.

## Notes

The plan named `selectors.ts` as the target file, but this codebase's settled convention places tiers-derived view selectors in `queries.ts` beside their query hook (per `useVaultTreeAvailability`, `deriveRagStatusView`, `derivePipelineStatusView`); no `selectors.ts` exists. The selector was placed in `queries.ts` to match that convention and the layer-ownership boundary, rather than introducing a divergent file.
