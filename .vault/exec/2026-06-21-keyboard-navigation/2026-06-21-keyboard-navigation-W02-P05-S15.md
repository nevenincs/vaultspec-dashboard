---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-22'
modified: '2026-07-12'
step_id: 'S15'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---

# Enroll the files tree onto FocusZone with the same tree semantics

## Scope

- `live-verify parity with the vault tree`
- `frontend/src/app/left/CodeTree.tsx`

## Description

- Converted the files (code) tree onto the shared `useFocusZone` with the same shape as the vault tree: replaced the bespoke roving + the `onRowKeyDown` helper with one `rove(key, opts)`; the directory row consumes ref/tabIndex/onKeyDown; cross-axis ArrowRight expands a collapsed dir and ArrowLeft collapses an expanded one; files select via the native button click.
- Removed the now-unused `deriveBrowserTree*` imports, the `onRowKeyDown` helper, and the `useRef`/`useCallback`/`ReactKeyboardEvent` imports.

## Outcome

- Live-verified (chrome-devtools, real keys): the files tree has one tab stop and roves (.vault → engine → frontend and back); ArrowRight on the collapsed `.vault` folder expanded it (39 → 47 rows, aria-expanded false → true) with focus staying on the row in the left rail. tsc/eslint/prettier clean; CodeTree + tree + FocusZone tests (38) green.

## Notes

- Inherited the FocusZone double-invoke/dedup hardening from S14; no extra work needed.
- Live testing was repeatedly disrupted by dev-server HMR full reloads (a file save reloads the ~15s graph and resets focus to the stage); each result here was confirmed on a clean, settled load.
