---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-24'
modified: '2026-06-24'
step_id: 'S26'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---

# Enroll the timeline controls (playhead step/nudge, range) onto the model with keyboard operation

## Scope

- `live-verify`
- `frontend/src/app/timeline/TimelineControls.tsx`

## Description

- Verified the timeline controls are keyboard-operable (no change needed): the Playhead grip is a `role="slider"` with `tabIndex={0}`, `aria-label="playhead"`, `aria-valuenow`, an `onKeyDown` that steps/nudges, and an `aria-live` status; the TimelineControls range surface is native `<button>`s + a date-range dialog of `<input>`s with its own keydown.
- Live-verified via a self-launched Chromium (the locked-MCP workaround): focusing the playhead slider and pressing ArrowRight changed its `aria-valuenow` (1782307265066 → 1782307273202), and the timeline viewport region is focusable (tabIndex 0) for keyboard pan/zoom.

## Outcome

- The timeline controls (playhead step/nudge + range) are keyboard-operable and live-verified. No edit was made to `Timeline.tsx`/`TimelineControls.tsx` (a concurrent agent is actively editing those) — this step is a read-only verification of the existing/concurrent keyboard contract.

## Notes

- The remaining timeline piece — the per-mark aria-activedescendant CURSOR (S25, replacing the now-contained sr-only enumeration) — is NOT built and `Timeline.tsx` is actively concurrently edited, so it stays open to avoid collision. Region-level keyboard nav (viewport pan/zoom + playhead + minimap) is already in place.
