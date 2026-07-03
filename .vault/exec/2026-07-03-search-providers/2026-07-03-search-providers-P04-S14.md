---
tags:
  - '#exec'
  - '#search-providers'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S14'
related:
  - "[[2026-07-03-search-providers-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace search-providers with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S14 and 2026-07-03-search-providers-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Delete the vestigial right-rail search pillar: the search panel-tab entry, the focus-search action, keybinding, and command, and the unmounted presentation-view derivations with their tests and ## Scope

- `frontend/src/stores/server/engine.ts + searchController.ts + stores/view/rightRailKeybindings.ts + rightRailCommandProvider.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Delete the vestigial right-rail search pillar: the search panel-tab entry, the focus-search action, keybinding, and command, and the unmounted presentation-view derivations with their tests

## Scope

- `frontend/src/stores/server/engine.ts + searchController.ts + stores/view/rightRailKeybindings.ts + rightRailCommandProvider.ts`

## Description

- Remove the `search` entry from `DASHBOARD_PANEL_TABS` (`engine.ts`) and its
  label from the shell frame's `RIGHT_RAIL_TAB_LABELS` (`shellLayout.ts`): the
  right rail is now Status · Changes; search is the Cmd+K plane, not a tab.
- Delete the unmounted right-rail presentation derivations from
  `searchController.ts` — `SearchPresentationView`, `SearchResultRowView`,
  `deriveSearchResultRowView(s)`, `searchResultKeyboardFocusDelta`,
  `deriveSearchPresentationView`, and the orphaned `searchScoreLabel` — preserving
  the shared `SearchResultSpecies` / `searchResultSpecies` the pill and providers
  still use, and dropping the now-unused imports.
- Delete the focus-search command and keybinding: strip
  `RIGHT_RAIL_FOCUS_SEARCH_ACTION_ID`, `rightRailFocusSearchAction`,
  `focusRightRailSearch`, and their registration from `rightRailKeybindings.ts`
  (keeping the tab bindings); delete `rightRailCommandProvider.ts` and its
  side-import; remove the `focusRightRailSearch` intent from `CommandContext`
  (`commandRegistry.ts`) and its provision (`commandPaletteCommands.ts`); drop the
  re-export barrel entry (`rightRailActions.tsx`).
- Update every affected test to the two-tab reality: the coverage/guard tests
  (no focus-search action), the presentation tests (deleted), the rail/shell/
  panel-intent/dashboard-state/command-palette tab tests (Status · Changes, and
  a stale "search" heals to the default).

## Outcome

The dead right-rail search pillar is gone — no panel-tab entry, no focus-search
command/keybinding, no unmounted presentation view, no orphaned scanner. The full
frontend suite is green (2623 tests across 288 files) and the full lint gate
passes (0 errors). Grep-verified: no `deriveSearchPresentationView`, no
`focusRightRailSearch`, no `"search"` right-rail tab.

## Notes

Scope reached well beyond the four named files because the dead pillar was wired
across the command registry, the shell layout, and ~14 test files (the keymap
coverage guards, the panel-tab normalization tests, the dashboard-state and
command-palette tab tests). Those test updates overlap S16's "keymap coverage
guards for the deleted action"; they were done here because the deletion breaks
them and every commit must stay green. `useSearchController` /
`useUnifiedSearchController` were NOT deleted — they remain the semantic
provider's engine, so only the right-rail PRESENTATION layer over them was
removed. `noCodeFallback` retires with `SearchControllerView` here (its only
reader was the deleted presentation).
