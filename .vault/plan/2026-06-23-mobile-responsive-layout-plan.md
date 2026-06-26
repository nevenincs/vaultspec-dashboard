---
tags:
  - '#plan'
  - '#mobile-responsive-layout'
date: '2026-06-23'
modified: '2026-06-25'
tier: L3
related:
  - '[[2026-06-22-mobile-responsive-layout-adr]]'
  - '[[2026-06-22-mobile-responsive-layout-research]]'
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

# `mobile-responsive-layout` plan

## Wave `W01` - Foundation

Add the one viewport-class signal (D1), consolidate shell layout dimensions onto rem/token scale and close the px-guard blind spot (D1b), and implement the mobile chrome primitives (BottomTabBar, MobileTopBar, BottomSheet) in code mirroring the new Figma components. Downstream waves depend on this. Backed by the accepted mobile-responsive-layout ADR.

### Phase `W01.P01` - Viewport signal + dimension consolidation

One matchMedia-backed useViewportClass hook fed into the shell projection; shell dimensions onto rem/token scale; extend the px guard.

- [x] `W01.P01.S01` - Add a matchMedia-backed useViewportClass hook (compact|regular) keyed on one ~40rem breakpoint constant; `frontend/src/stores/view/viewportClass.ts`.
- [x] `W01.P01.S02` - Feed the viewport class into deriveShellFrameView so the one projection emits the compact frame shape; `frontend/src/stores/view/shellLayout.ts`.
- [x] `W01.P01.S03` - Move shell layout dimensions onto the rem/token scale and extend scan-px.mjs to cover .ts modules and runtime px composition; `frontend/src/stores/view/viewStore.ts`.

### Phase `W01.P02` - Mobile chrome primitives

Implement BottomTabBar, MobileTopBar, BottomSheet React components with safe-area + 44pt targets, mirroring the Figma components.

- [x] `W01.P02.S04` - Implement BottomTabBar (Active variant, safe-area inset, 44pt items) mirroring the Figma component; `frontend/src/app/shell/BottomTabBar.tsx`.
- [x] `W01.P02.S05` - Implement MobileTopBar (title + 44pt icon slots); `frontend/src/app/shell/MobileTopBar.tsx`.
- [x] `W01.P02.S06` - Implement BottomSheet shell (radius, elevation, grabber, safe-area); `frontend/src/app/chrome/BottomSheet.tsx`.

## Wave `W02` - Compact shell and IA

Feed the viewport-class signal into the existing useShellFrameView projection so it emits a single-pane + bottom-tab-bar frame on compact (D2); wire tab routing and the MobileTopBar. Depends on W01; precedes the surfaces wave.

### Phase `W02.P03` - Compact shell projection + routing

deriveShellFrameView emits single-pane + bottom-tab-bar on compact; tab routing selects the active surface; MobileTopBar wired.

- [x] `W02.P03.S07` - Emit the compact single-pane + bottom-tab frame shape from the shell projection; `frontend/src/stores/view/shellLayout.ts`.
- [x] `W02.P03.S08` - Add view-local active-compact-surface state and tab routing; `frontend/src/stores/view/viewStore.ts`.
- [x] `W02.P03.S09` - Render the compact AppShell branch composing the mobile primitives; `frontend/src/app/AppShell.tsx`.

## Wave `W03` - Compact surfaces

Build each compact surface: Browse landing with sliding document navigation (D5), filter bottom sheet (D3), full-screen search (D3), timeline minimode (D2t), status, and the non-navigable graph state (D4). Depends on W01/W02.

### Phase `W03.P04` - Browse + sliding document navigation

Compact Browse landing; slide-stack push/pop document reader (no docking).

- [x] `W03.P04.S10` - Build the compact Browse landing (vault/files toggle, features/documents trees) consuming existing left-rail stores hooks; `frontend/src/app/left/`.
- [x] `W03.P04.S11` - Implement the sliding push/pop document navigator (full-screen reader, edge-swipe back, no docking); `frontend/src/app/stage/`.

### Phase `W03.P05` - Filter sheet, search, timeline, status, graph

Filter bottom sheet; full-screen search palette; timeline minimode; status surface; non-navigable graph state.

- [x] `W03.P05.S12` - Present the app/left filter in a BottomSheet (guard intact) triggered from compact Browse; `frontend/src/app/left/`.
- [x] `W03.P05.S13` - Open the three-plane command palette full-screen on compact; `frontend/src/app/palette/`.
- [x] `W03.P05.S14` - Render the timeline minimode (scrubber-only, no lane viz) on compact; `frontend/src/app/timeline/`.
- [x] `W03.P05.S15` - Render the compact Status surface and the non-navigable Graph state (canvas not mounted on cold compact); `frontend/src/app/right/`.

## Wave `W04` - Polish and verify

Touch targets, safe-area, a11y, and visual parity against the approved Figma frames; final review. Depends on W03.

### Phase `W04.P06` - Touch/a11y + parity + review

Touch/safe-area/a11y conformance; visual parity to approved frames; final code review.

- [x] `W04.P06.S16` - Verify 44pt targets, safe-area, and keyboard/a11y on compact; `frontend/src/app/`.
- [x] `W04.P06.S17` - Visual-parity check each compact surface against its approved Figma frame; `run the full lint gate; route to review; `frontend/`.

## Description

Implements the accepted `2026-06-22-mobile-responsive-layout-adr` against the
design-converged compact frames in the binding Figma file (section "Compact ·
Mobile (responsive)"). Pure view-layer plus one stores-layer signal: a single
`useViewportClass` matchMedia hook feeds the existing `useShellFrameView`
projection so the SAME projection emits the desktop three-column grid (regular) or
a single-pane + bottom-tab-bar frame (compact). No engine, wire, or model change;
the stores hooks and `SceneController` contract are consumed unchanged
(`view-rewrite-preserves-the-state-and-scene-contract`). The filter stays authored
in `app/left/` (guard intact) and is presented in a bottom sheet; search reuses the
three-plane palette full-screen; the graph is non-navigable on compact (canvas not
mounted on a cold compact load, hidden-not-reparented on a runtime shrink per the
portal-pin rule); documents open via a sliding push/pop navigator (no docking). The
mobile chrome is built as three real kit components (BottomTabBar, MobileTopBar,
BottomSheet) mirroring the Figma components, with safe-area inset and ≥44pt targets
baked in. Shell dimensions are moved onto the rem/token scale and the px guard is
extended to the `.ts`/runtime-composition blind spot (ADR D1b).

**Gate:** per the ADR's design-first constraint, execution begins only after the
user approves the compact Figma frames.

## Steps







## Parallelization


## Verification
