---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S56'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace figma-parity-reconciliation with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S56 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
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
     The Tune the connection-drawing fidelity to the binding Hero frame, keeping document granularity bounded by the node ceiling and ## Scope

- `frontend/src/scene/field/backbone.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Tune the connection-drawing fidelity to the binding Hero frame, keeping document granularity bounded by the node ceiling

## Scope

- `frontend/src/scene/field/backbone.ts`

## Description

- Tune the connection-drawing fidelity contract on `backbone.ts` to the binding `graph/Hero` 85:2: document that the Hero's clean category-circles-on-faint-rule-lines reading is produced by the anti-hairball SPLIT here (lay out on the precise declared+structural backbone, disparity-thin the noisy tiers into a significant-subset context) while the flat-grey stroke treatment is rendered in the edge mesh layer from S45.
- Affirm the bounded-by-default boundary (graph-queries-are-bounded-by-default): the split operates on the slice the engine already bounded (constellation LOD, or document granularity capped by the engine `MAX_DOCUMENT_NODES` node ceiling and carried through the stores `truncated` block) and only partitions that bounded edge set, never re-expanding it, requesting more, or serializing an unbounded full-document field.
- Correct stale internal references from the retired FA2 worker to the current force driver in the module header and the two doc comments on the exported split, so the connection-drawing documentation matches the live d3-force driver.

## Outcome

The Hero connection-drawing fidelity is achieved through the existing, locked anti-hairball split (backbone = declared + structural + meta, context = disparity-thinned noisy tiers), keeping document granularity bounded by the engine node ceiling. The exported API is byte-for-byte stable: `splitBackbone`, `backboneEdgeIds`, `LAYOUT_BACKBONE_TIERS`, and `BackboneSplit` are unchanged in shape and behaviour. Scope gate green: tsc exit 0, eslint clean, prettier clean; `backbone.test.ts` passes (11/11).

## Notes

backbone.ts is shared with the concurrent scene agent's layout modules (`communityLayout`, `hierarchicalLayout`, `radialLayout`) and the field assembly, all of which consume `splitBackbone`, plus the out-of-fence `backbone.test.ts` that locks the split contract (backbone tiers exactly declared + structural). To honor the no-break directive on the shared module, this step changed ONLY documentation comments — no change to the split logic, the tier set, or any export. The flat-grey edge RENDER fidelity (the visible Hero treatment) was delivered in W03.P07.S45 in `edgeMeshes.ts` (out of this phase's scope); backbone.ts's contribution to the Hero is the clean anti-hairball split, which was already correct and is here documented as the binding connection-drawing contract. No export changed, so no scene-agent consumer needed flagging.
