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
