---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-21'
modified: '2026-06-21'
step_id: 'S10'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---




# Live-drive the app (chrome-devtools real keys): verify initial focus, full F6 region cycle, skip link, no trap, and Escape focus-restore

## Scope

- `capture the focus trace as evidence`
- `frontend/src/app/AppShell.tsx`

## Description

- Cold-reloaded the running app and drove it with real key events via the chrome-devtools protocol, reading `document.activeElement` after each press.
- Verified every foundation criterion in one consolidated pass on a fresh load.

## Outcome

Gate PASSED (live, cold load):
- Initial focus is `MAIN#stage` (never `<body>`); a visible focused element exists from load.
- Total tabbable elements: 109 (down from ~1,100 at diagnosis) — the flat-order trap is gone.
- The skip link is the first focusable ("Skip to content"); the dev degrade button is `tabIndex -1`; the timeline contributes 0 tabbable of its 1,000 sr-only buttons.
- F6 cycles stage to right-rail to timeline to left-rail to stage (full wrap); Shift+F6 reverses. Trace captured: `[right-rail, timeline, left-rail, stage]` then Shift+F6 `[left-rail]`.
- Dismissing a Popover-backed flyout lands focus on a real control, never `<body>`.

The W01 Foundation wave (FocusZone primitive, region traversal, trap remediation, gate) is complete and live-verified. No component enrolls until this wave passed — it has.

## Notes

- Recurring dev-server gotcha: editing any file triggers an HMR full reload (~15s graph reload) that resets `window` globals and re-runs the initial-focus effect; re-arm live tracers after edits and read in tight sequences.
- The two-tier model's full payoff (one tab stop per region) lands progressively as W02+ converts trees/lists to single-stop FocusZones; 109 is the post-foundation baseline, not the final count.
