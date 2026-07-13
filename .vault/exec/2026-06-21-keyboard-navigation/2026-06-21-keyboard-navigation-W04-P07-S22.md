---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-23'
modified: '2026-07-12'
step_id: 'S22'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---

# Enroll the right-rail list rows (plans/PRs/issues/commits) onto FocusZone roving with Enter to open

## Scope

- `live-verify`
- `frontend/src/app/right/StatusTab.tsx`

## Description

- Enrolled the right rail's PR rows (the display-only `<li>`s that were keyboard-UNREACHABLE) onto a per-section `useFocusZone`: added a reusable `useRowZone` hook + `RowNav` type, gave `PrRow` an optional `nav` so a section makes it focusable + roving, and wired both `OpenPrsBody` and `RecentPrsBody` (which share `PrRow`).
- A focused PR row now: roves by arrows (one tab stop per section), and Enter/Space + Shift+F10/Menu open its context menu (the row's action) at the row — mirroring the tree-row `handleKeyboardContextMenu` pattern. The pointer context menu is unchanged.

## Outcome

- Code-verified: tsc/eslint/prettier clean; all 62 right-rail tests pass (no regression). The enrollment reuses the exact rove + keyboard-context-menu pattern already proven LIVE in the tree conversions.

## Notes

- Correct scope per APG (focusable == interactive): PR rows have a context-menu action → enrolled. `IssueRow` is PURE display (no onClick, no context menu, no action) → deliberately left non-focusable. Plan rows (PlanPill buttons) and commit rows (expandable) are already keyboard-interactive/Tab-reachable.
- LIVE verification was BLOCKED this turn: both browser MCPs locked mid-step (chrome-devtools grabbed by a concurrent agent; Playwright already locked). Re-confirm the PR-row roving live when a browser frees up; the code follows a live-proven pattern and passes the full test/type/lint gate.
