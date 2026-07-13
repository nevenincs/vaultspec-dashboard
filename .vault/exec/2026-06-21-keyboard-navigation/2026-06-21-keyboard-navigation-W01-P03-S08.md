---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-21'
modified: '2026-07-12'
step_id: 'S08'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---

# Contain the timeline sr-only ~1000-button node list behind a single focusable region entry so it no longer enumerates 1000 tab stops

## Scope

- `frontend/src/app/timeline/Timeline.tsx`

## Description

- Added `tabIndex={-1}` to each button in the timeline's `sr-only` accessible-node list so the ~1,000 per-node buttons leave the Tab sequence; they stay present for the screen-reader list and as the target set for the W05 activedescendant mark cursor.

## Outcome

- Live-verified the dominant tab-ring win: total tabbable elements dropped from ~1,100 to 109; the timeline contributes 1,000 buttons of which 0 are now tabbable. Timeline tests (14) still green. The timeline region remains a single tab stop.

## Notes

- This is the foundation CONTAINMENT only — it removes the 1,000-stop trap. Per-mark keyboard traversal is restored properly by the timeline mark cursor in W05.P08.S25 (arrows/Home/End over an aria-activedescendant cursor). Until then, marks are selectable by pointer; timeline pan/zoom keyboard control is unaffected.
