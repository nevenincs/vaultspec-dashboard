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

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace node-visual-richness with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S16 and 2026-06-14-node-visual-richness-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The render the compact card projection from a stores node-detail hook and ## Scope

- `frontend/src/stores/server/queries.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
