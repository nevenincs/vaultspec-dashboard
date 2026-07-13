---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-24'
modified: '2026-07-12'
step_id: 'S27'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---

# Give the timeline minimap a keyboard contract (focusable, arrows move the viewport band)

## Scope

- `live-verify`
- `frontend/src/app/timeline/Minimap.tsx`

## Description

- Verified the timeline minimap has a keyboard contract (no change needed): it is a `role="slider"` with `tabIndex={0}` and an `onKeyDown` that moves the viewport band by arrow keys.
- Live-verified via the self-launched-Chromium workaround: focusing the minimap slider and pressing ArrowRight changed its `aria-valuenow` (1781697600000 → 1781782722783) — the viewport band moves by keyboard.

## Outcome

- The minimap is keyboard-operable (focusable slider, arrows move the band) and live-verified. Read-only verification — no edit to the concurrently-edited timeline files.

## Notes

- Satisfied by existing/concurrent work; this campaign's contribution is the live verification.
