---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-22'
modified: '2026-07-12'
step_id: 'S14'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---

# Enroll the vault tree onto FocusZone (Up/Down rove rows, Left/Right collapse/expand, Home/End, typeahead, Enter open) as one tab stop with entry-memory

## Scope

- `live-verify`
- `frontend/src/app/left/TreeBrowser.tsx`

## Description

- Converted the vault tree onto the shared `useFocusZone`, retiring the bespoke render-time roving (registerNav/registerVisibleKey/moveActive and the `deriveBrowserTree*` helpers) whose keyboard-target derivation returned null so arrow nav was dead. The `RowNav` API became one `rove(key, opts)`; the section header and `VaultTreeRow` consume it; cross-axis ArrowRight/ArrowLeft maps to expand/collapse; Enter still opens a leaf.
- Hardened `useFocusZone` itself to make the tree work: (a) fall back to a CONCRETE first key (`prevOrder[0]`), not null, so the tab-stop resolution is idempotent under React's double-invoked render; (b) dedupe the order via a per-render `seenKeys` set, since each row's `rove` runs twice (StrictMode) and a duplicated order broke movement (next == self).

## Outcome

- Live-verified (chrome-devtools, real keys): the tree has exactly one tab stop, and ArrowDown/ArrowUp rove through features (Features → Vaultspec Engine → Dashboard Gui → Graph Node Salience and back), Home jumps to the first item. tsc/eslint/prettier clean; TreeBrowser + VaultBrowser + FocusZone tests (38) green.

## Notes

- Root cause was diagnosed by temporarily exposing the zone state on `window.__fz` — it showed `activeKey:null, rovingKey:null` but a length-86 order with adjacent duplicate keys, revealing the StrictMode double-invoke. Debug line removed.
- The FocusZone hardening also benefits the files tree (S15) and any future consumer.
