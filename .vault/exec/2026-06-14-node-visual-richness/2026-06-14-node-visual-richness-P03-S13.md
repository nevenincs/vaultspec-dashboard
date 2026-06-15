---
tags:
  - '#exec'
  - '#node-visual-richness'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S13'
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
     The S13 and 2026-06-14-node-visual-richness-plan placeholders are machine-filled by
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
     The add sprite-layer tests for the class-to-treatment mapping and token reads and ## Scope

- `frontend/src/scene/field/nodeSprites.test.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# add sprite-layer tests for the class-to-treatment mapping and token reads

## Scope

- `frontend/src/scene/field/nodeSprites.test.ts`

## Description

- Add sprite-layer unit tests for the class-to-treatment selection: `coarseStamp` (the far-LOD ring/slash/ghost) and `fineStampMarkId` (the near-LOD severity-dot / tier-notch mark id), covering every class including the compound superseded case and the rule-of-one mutual exclusion.
- Extend the cross-layer token-read test with a `stampColor` assertion that each new `--color-status-*` token resolves to its literal hex through the scene `getComputedStyle` seam, mirroring the existing state-token literal-hex contract.
- Add `nodeStatusFromWire` derivation tests covering tier/severity ordinal derivation, out-of-vocabulary class dropping, the both-absent undefined case, and the round-trip through `stampFor`.

## Outcome

The class-to-treatment mapping and the token reads are pinned GPU-free, exactly the field discipline used for `nodeRadius`/`stateColor`. All status-related test files pass, including the ink-coverage gate.

## Notes

The render-side selection is exercised through the pure `coarseStamp`/`fineStampMarkId` helpers (what the Pixi layer maps), so no GPU is needed to assert the mapping. Expected values were derived from the spec status table, never copied from output.
