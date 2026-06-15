---
tags:
  - '#exec'
  - '#node-visual-richness'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S05'
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
     The S05 and 2026-06-14-node-visual-richness-plan placeholders are machine-filled by
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
     The type status_value and status_class on the wire node and the stores mirror and ## Scope

- `frontend/src/stores/server/engine.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# type status_value and status_class on the wire node and the stores mirror

## Scope

- `frontend/src/stores/server/engine.ts`

## Description

- Add `status_value?: string` and `status_class?: string` to the wire-node type, placed beside `authority_class`/`aggregate`, documented to mirror the engine P01 additive projection.
- Note in the doc comments that both fields are optional, ride together, are absent on types with no per-type status machine, and never re-key the node.

## Outcome

The stores mirror now types the two additive status fields the engine serves on graph-query nodes, so every downstream consumer sees the same snake_case wire shape. No existing field changed; the change is purely additive.

## Notes

The fields stay strings on the wire (the closed-enum validation lives in the scene's pure status util, not the wire type), matching how `authority_class` is a bare string beside its closed vocabulary.
