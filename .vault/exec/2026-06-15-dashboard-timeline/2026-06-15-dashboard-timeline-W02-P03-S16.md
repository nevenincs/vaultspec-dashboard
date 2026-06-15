---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S16'
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
     The S16 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add the LineageSlice wire type carrying nodes, arcs, tiers, and truncated and ## Scope

- `frontend/src/stores/server/engine.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the LineageSlice wire type carrying nodes, arcs, tiers, and truncated

## Scope

- `frontend/src/stores/server/engine.ts`

## Description

- Add the `LineageSlice` wire type to the stores engine module, mirroring the live `/graph/lineage` envelope unwrapped onto the flat-with-tiers internal shape.
- Carry `nodes`, `arcs`, a `tiers` block, and an optional-nullable `truncated` honesty block, matching the engine `LineageSlice` serialization exactly.

## Outcome

`LineageSlice` lands in `engine.ts` in the same snake-case wire style as `GraphSlice`. `truncated` is typed present-and-non-null only when the document node ceiling fires; null otherwise. Consumed by the client method, the adapter, and the hook in later steps.

## Notes

The wire serves `tiers` on the envelope (not inside `data`); `unwrapEnvelope` lifts it onto the flat body, so the internal type carries `tiers` directly.
