---
tags:
  - '#exec'
  - '#node-visual-richness'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S16'
related:
  - "[[2026-06-14-node-visual-richness-plan]]"
---

# render the compact card projection from a stores node-detail hook

## Scope

- `frontend/src/stores/server/queries.ts`

## Description

- Project the compact card view model from the node-detail stores hook (`useNodeDetail`), the single wire seam the host consumes — the card never fetches and never reads the raw tiers block (dashboard-layer-ownership).
- Add a pure `cardModelFromNode` projection that maps an engine node to the card's typed model: id, kind, title (falling back to the id), the status object derived through the same scene status util the canvas stamp uses, the authority class, and the rollout bar fed ONLY when the node carries lifecycle progress (the SEPARATE channel for plan/feature).
- Wire the card's `onOpen` to the existing open intent so the bloom's affordance opens the full interior through the same path a scene `open` event uses.

## Outcome

The card's content is fed entirely through a stores hook and the pure projection, so it reads one truth with the canvas stamp (the shared status util) and surfaces the rollout channel only when real progress exists. The open affordance routes through the existing open intent rather than a bespoke path.

## Notes

The plan scoped this Step to the queries module; the implementation CONSUMES the already-present `useNodeDetail` hook there rather than adding a new query (no new wire seam was needed), and the pure projection + the consuming host live in the card host file. The projection reuses the scene's `nodeStatusFromWire` util rather than re-deriving status in a view component, keeping the card and the stamp on one mapping.
