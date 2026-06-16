---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S48'
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
     The S48 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
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
     The Rebuild the selected node state with the single-accent selection ring per the binding frame and ## Scope

- `frontend/src/scene/field/egoHighlight.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Rebuild the selected node state with the single-accent selection ring per the binding frame

## Scope

- `frontend/src/scene/field/egoHighlight.ts`

## Description

- Make the SELECTED node state faithful to the binding `graph/Node-items` "selected" frame: the concentric single-accent ring is the one PERSISTENT selection signal, so it must never dissolve into the receded field the way a body does when a hover ego is held elsewhere.
- Add the selected-state ring-alpha policy to `egoHighlight.ts` (the owner of the recede constant): a pure `selectedRingAlpha(egoHeld, lifted)` that returns full strength when no ego is held or when the selected node is itself the lifted ego, and otherwise holds a legibility FLOOR above the body recede, plus the `SELECTED_RING_RECEDE_FLOOR` constant.
- Wire `nodeSprites` `refresh()` to drive the ring alpha through that policy instead of plainly following the body recede, deriving `egoHeld` once from the highlight set; the body and anatomy still follow the recede, the ring composes with it.
- Cover `selectedRingAlpha` in `egoHighlight.test.ts`: full with no ego, full when the selected node is the ego, and the legibility floor (strictly above the recede, below full) when the selected node is outside a held ego.

## Outcome

The selected node's accent ring stays the single legible selection cue across the default, hover-ego, and ego-recede interactions, matching the binding frame. The accent is still the single muted `state-active` token (unchanged from P07). Scoped scene tests green (`egoHighlight.test.ts`, `nodeSprites.test.ts`, `nodeSprites.draw.test.tsx`).

## Notes

The ring geometry and colour (`selectedRingRadius`/`selectedRingColor`) were already faithful from P07; S48 completes the SELECTED state's behaviour under interaction. The ring still never follows the ghost floor (a selected retired node shows a clear ring). Scope touched `egoHighlight.ts` and `nodeSprites.ts` (the consumer) plus their tests; no SceneController surface change.
