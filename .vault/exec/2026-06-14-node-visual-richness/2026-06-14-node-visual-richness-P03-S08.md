---
tags:
  - '#exec'
  - '#node-visual-richness'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S08'
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
     The S08 and 2026-06-14-node-visual-richness-plan placeholders are machine-filled by
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
     The add status_value and status_class to the scene node data as a flagged seam redline and ## Scope

- `frontend/src/scene/sceneController.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# add status_value and status_class to the scene node data as a flagged seam redline

## Scope

- `frontend/src/scene/sceneController.ts`

## Description

- Add an optional `status?: { value?: string; class?: StatusClass; ordinal?: number }` field to the locked scene node-data type, importing `StatusClass` from the scene's pure status util.
- Flag it as an additive seam redline in the doc comment, mirroring the existing `salience`/`memberCount` redlines per the lock discipline, and note the sigma fallback ignores it.

## Outcome

The locked scene seam now carries the resolved status object additively, so the renderer can read status without any existing seam member changing. The exact shape is `status?: { value?: string; class?: StatusClass; ordinal?: number }`.

## Notes

The redline stays minimal — one optional field on the RL-1 surface, backward-compatible, no new command or event. The import is type-only.
