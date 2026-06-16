---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S03'
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
     The S03 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
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
     The Author the DTCG elevation source with the Figma three-level scale raised, overlay, and popover and ## Scope

- `frontend/tokens/elevation.tokens.json` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Author the DTCG elevation source with the Figma three-level scale raised, overlay, and popover

## Scope

- `frontend/tokens/elevation.tokens.json`

## Description

- Authored a new DTCG elevation source under the tokens directory carrying the binding Figma three-level scale: raised, overlay, and popover.
- Each level is a shadow token holding an ink-tinted layered drop-shadow value that harmonises with the warm neutral ground (depth via soft elevation, never gradients or textures).
- Authored the base/light shadow values only, recording in the description that the per-theme dark and high-contrast shadow remaps stay hand-authored in the stylesheet per the tokens README scope boundary.

## Outcome

The elevation taxonomy is authored as DTCG faithful to the binding Figma three levels, collapsing the prior six-level flat/card/panel/float/dialog/deep scale. The raised/overlay/popover levels reuse the existing card/float/dialog drop-shadow geometries so the visual depth is preserved while the count drops to three. Consumed by the generator and Figma mirror extensions.

## Notes

Only the base shadow values are generated; the dark and high-contrast per-theme shadow overrides remain hand-authored in the stylesheet theme blocks because per-mode shadows are deliberately outside the generated set (the README scope boundary). This keeps warmth-lives-in-tokens satisfied: depth is a token, expressed as a soft ink-tinted shadow, with no decoration.
