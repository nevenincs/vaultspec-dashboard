---
tags:
  - '#plan'
  - '#mobile-unified-rail'
date: '2026-07-12'
modified: '2026-07-12'
tier: L2
related:
  - '[[2026-07-12-mobile-unified-rail-adr]]'
---

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the
       related: field above.
     - The related: field carries the AUTHORISING documents
       (ADR, research, reference, prior plan) for every Step in
       this plan. Steps inherit this chain; per-row reference
       footers do not exist.
     - NEVER use [[wiki-links]] or markdown links in the
       document body. -->

# `mobile-unified-rail` plan

Merge the compact left rail (Browse) and right rail (Status) into one Status-first vertical scroll so critical plan, PR, issue, and commit state is glanceable on a phone instead of hidden behind a tab.

## Description

The compact shell (`CompactAppShell.tsx`) shows one surface at a time under the bottom tab bar, so the right-rail Status content - plan progress, open PRs and issues, the working-tree Changes fold, and recent commits - hides behind a tab a Browse-landing user never taps. Per the authorising ADR and its research, the compact Browse and Status surfaces merge into ONE vertical scroll - Status first, then the Browse tree, each under a sticky collapsible section header - so the critical state is always in reach. The work is view-layer only: a small surface-store cutover, a new unified-rail component composing the existing `StatusTab` and `LeftRail` under the shared `FoldSection` primitive, a shell rewire, and a reduced bottom tab bar. No engine, wire, or model change; the corpus filter stays authored in `app/left/`; the portal-pinned graph is untouched (v1 D4 stands).

## Steps

### Phase `P01` - Surface model: one Home pane

Collapse the mutually-exclusive Browse and Status compact surfaces into a single Home pane so the two rails can be co-resident, and add the view-local fold state for the unified rail's two top-level sections.

- [x] `P01.S01` - Cut the compact surface union to Home and Timeline plus the momentary Search, renaming the browse pane to home and updating the default, reset, and pane helpers; `frontend/src/stores/view/compactSurface.ts`.
- [x] `P01.S02` - Add a view-local fold store for the unified rail's STATUS and BROWSE top-level sections, both expanded by default, Status first; `frontend/src/stores/view/compactRailSections.ts`.

### Phase `P02` - Unified rail and shell wiring

Author the Status-first unified scroll rail and wire it into the compact shell, reducing the bottom tab bar to the surviving surfaces.

- [x] `P02.S03` - Author the unified rail composing the Status overview then the Browse tree as natural-height sticky collapsible sections under one outer scroll; `frontend/src/app/shell/CompactUnifiedRail.tsx, frontend/src/app/left/CompactFilterSheet.tsx, frontend/src/app/left/BrowserRegion.tsx, frontend/src/app/left/LeftRail.tsx`.
- [x] `P02.S04` - Render the unified rail for the Home pane in the compact shell, keep the Timeline pane, and route the search, advanced-filter, and workspace-switcher triggers to the Home top bar; `frontend/src/app/shell/CompactAppShell.tsx`.
- [x] `P02.S05` - Reduce the bottom tab bar to Home, Timeline, and Search and update its glyphs and labels; `frontend/src/app/shell/BottomTabBar.tsx`.

### Phase `P03` - Tests and gate

Update the affected tests for the new surface set and unified rail, and take the full frontend lint gate plus vitest to green.

- [x] `P03.S06` - Update the compact surface store tests for the Home and Timeline surface set; `frontend/src/stores/view/compactSurface.test.ts`.
- [x] `P03.S07` - Add pure unit and render tests for the compact rail-sections fold store and the reduced bottom tab bar; `frontend/src/stores/view/compactRailSections.test.ts, frontend/src/app/shell/BottomTabBar.test.tsx`.
- [x] `P03.S08` - Run the full frontend lint gate and vitest suite and drive to green; `frontend/`.

## Parallelization

Phases are strictly ordered: P01 (surface model) before P02 (rail and shell wiring) before P03 (tests and gate). Within P01, S01 and S02 are independent (distinct new/edited files) and may run in parallel. Within P02, S03 (the unified rail component) is the integration-sensitive step - both compact rails expect to fill a flex parent, so composing them as natural-height sticky sections under one scroll is done first and carefully; S04 (shell wiring) depends on S03; S05 (bottom tab bar) is independent of S03/S04 and may run in parallel with them, gated only by the S01 surface-union type. Within P03, S06 and S07 are independent; S08 is the terminal gate over the whole change.

## Verification

- Compact viewport renders one vertical scroll with the Status section first and the Browse tree below, each under a sticky collapsible header; the bottom tab bar shows Home, Timeline, and Search only.
- The Status content (plan progress, open PRs/issues, Changes fold, recent commits) is reachable by scrolling the Home pane without any tab switch.
- Regular (desktop) viewport is unchanged: the three-column shell and its rails are untouched.
- `compactSurface` exposes only the Home and Timeline panes plus the momentary Search; no `status` or `browse` pane id survives.
- The full frontend lint gate (`just dev lint frontend`: eslint + prettier + tsc) and the vitest suite pass at exit 0.
- vaultspec-code-review signs off on the completed steps.
