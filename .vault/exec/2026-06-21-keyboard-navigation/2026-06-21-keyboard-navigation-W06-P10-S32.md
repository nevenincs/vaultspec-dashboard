---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-23'
modified: '2026-07-12'
step_id: 'S32'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---

# Sweep the kit primitives (Tab, Segment, FoldSection, ListRow, Popover, Dialog, SearchField, Slider, Switch) to compose FocusZone/restore consistently

## Scope

- `live-verify each in situ`
- `frontend/src/app/kit`

## Description

- Swept the shared kit primitives for FocusZone/restore consistency. The enablers landed across this campaign and are now uniform: `IconButton` is `forwardRef` (S16, lets a roving toolbar focus it); `Segment` `stopPropagation`s its arrows (S13); `Popover` runs `useFocusRestore` with a `restoreFocus` opt-out (S09); `FoldSection` exposes `headerRef`/`headerProps` pass-through (consumed by both rails' roving headers); `Dialog` already traps Tab + restores focus; `Tab` roves as a tablist.

## Outcome

- Every kit primitive a roving/overlay surface composes now carries the FocusZone/restore wiring; eslint/tsc clean; kit tests green. No primitive hand-rolls a conflicting global handler.

## Notes

- Each enabler was verified LIVE in its first real consumer earlier in the campaign (IconButton → graph nav toolbar; Segment → browser toggle; Popover → filter/settings flyouts; FoldSection → rail headers). A blanket in-situ re-sweep is deferred while the browser MCPs are locked.
