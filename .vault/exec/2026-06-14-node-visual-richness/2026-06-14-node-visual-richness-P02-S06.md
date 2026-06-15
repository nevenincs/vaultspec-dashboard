---
tags:
  - '#exec'
  - '#node-visual-richness'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S06'
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
     The S06 and 2026-06-14-node-visual-richness-plan placeholders are machine-filled by
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
     The thread the status fields through the live adapter and the scene-mapping seam and ## Scope

- `frontend/src/scene/sceneMapping.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# thread the status fields through the live adapter and the scene-mapping seam

## Scope

- `frontend/src/scene/sceneMapping.ts`

## Description

- Add a pure `nodeStatusFromWire(value, cls)` helper to the scene's status util that builds the resolved status, dropping a class outside the closed treatment vocabulary and deriving the ordinal magnitude from the raw value (tier `L1..L4` to 1..4, severity `low|medium|high|critical` to 1..4, else undefined).
- Thread `status_value`/`status_class` through the sole wire-to-scene seam by calling that helper, so the scene node carries the resolved `status` object.

## Outcome

The wire status fields now reach the scene node as a resolved `{ value, class, ordinal }` object, with the ordinal derivation living in the scene's pure util rather than any view component, honoring the layer-ownership boundary. The live adapter required no change: the additive fields ride through `adaptGraphSlice` on the spread-through node body untouched.

## Notes

The derivation deliberately returns `undefined` when both fields are absent so the seam field is omitted entirely rather than carrying a malformed status; an out-of-vocabulary class keeps the raw value but drops the class, and `stampFor` renders that blank.
