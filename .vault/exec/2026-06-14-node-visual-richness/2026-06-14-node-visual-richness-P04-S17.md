---
tags:
  - '#exec'
  - '#node-visual-richness'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S17'
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
     The S17 and 2026-06-14-node-visual-richness-plan placeholders are machine-filled by
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
     The implement grow-from-glyph bloom with hover-dwell and a reduced-motion crossfade and ## Scope

- `frontend/src/app/islands/HoverCard.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# implement grow-from-glyph bloom with hover-dwell and a reduced-motion crossfade

## Scope

- `frontend/src/app/islands/HoverCard.tsx`

## Description

- The grow-from-glyph bloom and the reduced-motion crossfade already existed in the standalone card: the bloom grows from a top-left transform-origin (where the node sits) over ~180ms ease-out with a fade, and under `prefers-reduced-motion` (OS query or explicit prop) the transform travel is dropped for an instant opacity crossfade. This Step wires that motion into the live host and adds the hover-dwell.
- Add a ~150ms hover DWELL in the host: the hovered id is held only after it survives the dwell, so a glancing pass over a node shows nothing; hover-out clears instantly (no dwell on the way down), so the card dismisses without a trailing delay.
- Re-enable pointer events on the card's open affordance so it stays clickable inside the host's inspect-only wrapper, without changing the bloom motion.

## Outcome

The bloom now runs on the live canvas behind a dwell gate: transform/opacity only, growing from the glyph anchor, with the reduced-motion path swapping the travel for an instant crossfade. The dwell keeps a glancing hover from flashing a card, and hover-out dismisses cleanly.

## Notes

The motion itself was already correct in the standalone card (transform-origin bloom + reduced-motion crossfade), so this Step's edit to the card file was minimal (the open-button pointer-events) and the DWELL landed in the host. The dismiss ease-out is the opacity transition the card already carries; the host's instant hover-out clear drives it.
