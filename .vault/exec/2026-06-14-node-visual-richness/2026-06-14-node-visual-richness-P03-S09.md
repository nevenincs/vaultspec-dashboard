---
tags:
  - '#exec'
  - '#node-visual-richness'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S09'
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
     The S09 and 2026-06-14-node-visual-richness-plan placeholders are machine-filled by
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
     The author the status-mark family of severity-dot fill levels and the tier notch and ## Scope

- `frontend/src/scene/field/marks.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# author the status-mark family of severity-dot fill levels and the tier notch

## Scope

- `frontend/src/scene/field/marks.ts`

## Description

- Confirm the status-mark family (severity gauge 1..4 and tier staircase 1..4) authored in-family on the Phosphor grid is registered into the mark inventory and texturable set.

## Outcome

The two status-mark families ship and resolve through the texture seam by stable id (`status-severity-N` / `status-tier-N`), consumed by the sprite layer's fine stamp.

## Notes

The mark geometry was authored by the prototype landing commit; this step verified it stands rather than re-authoring the table, so the work here was confirmation, not new authoring.
