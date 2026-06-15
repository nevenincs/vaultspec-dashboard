---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S20'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-timeline with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S20 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add a tolerant liveAdapters adapter that reconciles the lineage slice shape and ## Scope

- `frontend/src/stores/server/liveAdapters.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add a tolerant liveAdapters adapter that reconciles the lineage slice shape

## Scope

- `frontend/src/stores/server/liveAdapters.ts`

## Description

- Add the tolerant `adaptLineageSlice` to `liveAdapters.ts`, reconciling the unwrapped lineage body onto the internal `LineageSlice`.
- Tolerate every optional/absent field: a node's `title`, an arc's `derivation`, the whole `truncated` block, and absent `nodes`/`arcs` arrays default to safe empties so a sparse shape never throws.
- Forward `dates.modified` only when numeric (never coerce a string), default an unknown phase to `research` and an unknown tier to `structural`, and carry the envelope `tiers` block verbatim.

## Outcome

`adaptLineageSlice` is the anti-corruption seam between the live wire and the internal type; a body already in the internal shape (the mock) passes through unchanged, preserving the one-code-path property.

## Notes

Modeled on `adaptFileTree`/`adaptPlanInterior` defensive style; `truncated` is null unless the engine served the three-field honesty object.
