---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S02'
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
     The S02 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
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
     The Author the DTCG radius source with the Figma scale xs4, sm5, md7, lg10, and pill18 and ## Scope

- `frontend/tokens/radius.tokens.json` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Author the DTCG radius source with the Figma scale xs4, sm5, md7, lg10, and pill18

## Scope

- `frontend/tokens/radius.tokens.json`

## Description

- Authored a new DTCG radius source under the tokens directory carrying the binding Figma radius scale: xs at 4px, sm at 5px, md at 7px, lg at 10px, and pill at 18px.
- Each step is a dimension token in rem with a description naming its binding role (chips, controls, panels, dialogs, pill shapes).
- Recorded that pill is new (the prior code used a native fully-rounded utility) and that these emit as the canonical radius foundation tokens with the legacy names kept as deprecated aliases until the view rewrite.

## Outcome

The radius taxonomy is authored as DTCG faithful to the binding Figma scale, replacing the prior sm4/md6/lg10/xl14 set. md is now 7px (was 6px) and the new pill 18px is available for the rounded-full re-key in the view rewrite. Consumed by the generator and Figma mirror extensions.

## Notes

The prior xl 14px radius has no exact Figma counterpart; the nearest binding step is lg 10px, so the legacy xl alias resolves there during the alias window (recorded in the alias block, S09).
