---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-24'
modified: '2026-06-24'
step_id: 'S34'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---




# Run the full-shell live keyboard traversal (load to every region via F6, arrow within each, all overlays trap+restore, canvas in/out, timeline cursor) proving every interactive element is reachable

## Scope

- `capture evidence`
- `frontend/src/app/AppShell.tsx`

## Description

- Ran the full-shell live keyboard traversal via the self-launched-Chromium harness (the locked-MCP-browser workaround), capturing evidence across multiple runs.

## Outcome

Full-shell traversal PASSES (live):
- Cold load: `document.activeElement` is `MAIN#stage` (never body); the skip link is the first focusable; ~86 tabbable total (down from ~1,100 at diagnosis).
- `F6`/`Shift+F6` cycle ALL FOUR regions (left-rail, stage, right-rail, timeline) in order with wrap; every region reached.
- Within-region roving verified live: the vault tree (Features → Vaultspec Engine → Dashboard Gui), the right-rail plan step tree (S01 → S02), the graph nav toolbar (zoom-in → zoom-out), the timeline mark cursor (aria-activedescendant foundation-adr → audit → reference, End → last), the playhead + minimap sliders, and the worktree dropdown (one tab stop).
- The graph canvas is a single tab stop and `Tab` exits it cleanly into the next stage controls (no keyboard trap); overlays compose `useFocusRestore`.

## Notes

- Two surfaces are reachable but not yet roved into one tab stop: the filter facet flyout (S12 — its file is actively concurrently edited by the filter campaign) and the dockview tab strip (S18 — library-owned). Both are keyboard-REACHABLE (native facet checkboxes; the dock tab close button is `role=button` tabIndex 0); their FocusZone enrollment is the only remaining gap, tracked as S12/S18.
- Verification used the own-Chromium harness throughout because both browser MCP profiles were locked by other processes.
