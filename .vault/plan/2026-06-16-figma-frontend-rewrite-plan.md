---
tags:
  - '#plan'
  - '#figma-frontend-rewrite'
date: '2026-06-16'
modified: '2026-07-12'
tier: L3
related:
  - '[[2026-06-16-figma-frontend-rewrite-adr]]'
---

# `figma-frontend-rewrite` plan

## Wave `W01` - Foundation: tokens + centralized component kit

Author the binding Figma variable set into the DTCG token source and regenerate the stylesheet (light/dark/HC peers, add Fraunces), then build every centralized component to the kit board so all surfaces compose from real shared definitions.

### Phase `W01.P01` - Token foundation to binding variables + Fraunces

Transcribe get_variable_defs(0:1) into the token JSON, regenerate styles.css, verify literal-hex scene tokens, add the Fraunces served face.

- [x] `W01.P01.S01` - Transcribe get_variable_defs(0:1) into the DTCG token JSON and add the Fraunces served face, then regenerate the stylesheet; `frontend/tokens/`.
- [x] `W01.P01.S02` - Verify every generated token equals its binding Figma variable and that scene-read tokens are literal hex; `frontend/src/styles.css`.

### Phase `W01.P02` - Centralized component kit (board 135:2)

Build Button/IconButton/Tab/SectionLabel/Chip/SearchField/Card/ListRow/Switch/SegmentedToggle/ProgressBar/Kbd/Slider/Divider/Breadcrumb/Tooltip/TreeRow/DropdownButton/StatusDot/PropertyRow/CodeBlock and the glyph set to their variant matrices.

- [x] `W01.P02.S03` - Build the core controls (Button, IconButton, Tab, Chip/Badge, StatusDot) to their variant/state matrices; `frontend/src/app/kit/`.
- [x] `W01.P02.S04` - Build the inputs (SearchField, Switch, SegmentedToggle/Segment, Slider, DropdownButton); `frontend/src/app/kit/`.
- [x] `W01.P02.S05` - Build the containers and misc (Card, ListRow, SectionLabel, Divider, ProgressBar, Kbd, Tooltip, Breadcrumb, TreeRow, PropertyRow, CodeBlock) and the glyph set; `frontend/src/app/kit/`.

## Wave `W02` - Shell and rails

Rebuild the master AppShell, the far-left icon rail, LeftRail, ActivityRail, and DocHeader to their boards, consuming the preserved stores hooks.

### Phase `W02.P03` - AppShell + icon rail (117:2)

Master grid layout and the far-left icon rail.

- [x] `W02.P03.S06` - Rebuild the master AppShell grid and the far-left icon rail; `frontend/src/app/shell/`.

### Phase `W02.P04` - LeftRail (244:750)

Workspace header, Vault/Tree/Code toggle, filter field, grouped document list with category status dots.

- [x] `W02.P04.S07` - Rebuild the LeftRail (workspace header, Vault/Tree/Code toggle, filter field, grouped document list); `frontend/src/app/left/`.

### Phase `W02.P05` - ActivityRail (244:753)

Status/Changes/Search tabs, context card, open-plans tree, recent commits.

- [x] `W02.P05.S08` - Rebuild the ActivityRail (Status/Changes/Search tabs, context card, open-plans tree, recent commits); `frontend/src/app/right/`.

### Phase `W02.P06` - DocHeader (283:1170)

Document header surface.

- [x] `W02.P06.S09` - Rebuild the DocHeader surface; `frontend/src/app/right/`.

## Wave `W03` - Stage, timeline, overlays, readers

Rebuild the stage chrome, the dual-lane timeline, the command palette / settings / context-menu / shortcuts overlays, and the reader-viewer family.

### Phase `W03.P07` - Stage chrome (toolbar/legend/zoom/minimap, NavControls 260:893)

Search+filter+layout toolbar, category legend, zoom cluster, minimap card.

- [x] `W03.P07.S10` - Rebuild the stage chrome (toolbar, category legend, zoom cluster, minimap card, NavControls); `frontend/src/app/stage/`.

### Phase `W03.P08` - Timeline (dual-lane + scrubber)

Timeline label, date-range pills, steps&summaries switch, two event lanes, accent scrubber.

- [x] `W03.P08.S11` - Rebuild the dual-lane Timeline with date-range pills, steps&summaries switch, and accent scrubber; `frontend/src/app/timeline/`.

### Phase `W03.P09` - Overlays (palette 94:2, settings 96:2, context-menu 98:2, shortcuts 104:39)

Command palette, settings dialog, context menu, keyboard-shortcuts surfaces.

- [x] `W03.P09.S12` - Rebuild the CommandPalette and SettingsDialog; `frontend/src/app/palette/`.
- [x] `W03.P09.S13` - Rebuild the ContextMenu and KeyboardShortcuts surfaces; `frontend/src/app/menu/`.

### Phase `W03.P10` - Readers and viewers (100:2/269:941, 101:2/248:738, DiffView 97:2)

Markdown reader (view/edit), code viewer, diff view, reader states.

- [x] `W03.P10.S14` - Rebuild the Markdown reader (view and edit modes) and reader states; `frontend/src/app/viewer/`.
- [x] `W03.P10.S15` - Rebuild the CodeViewer and DiffView; `frontend/src/app/viewer/`.

## Wave `W04` - Graph scene visual parity

Re-skin the scene's paint (node fills, grey edge rule, tier/state encodings, hover/selection, zoom cluster, minimap, layout/filter popovers) to the graph boards through the unchanged SceneController seam.

### Phase `W04.P11` - Node/edge/scene re-skin to graph boards

Category node fills, grey edge rule, tier/state encodings, hover/selection, layout picker, filter menu, settings popover, hero.

- [x] `W04.P11.S16` - Re-skin node/edge paint (category fills, grey rule, tier/state encodings, hover/selection) to the graph boards; `frontend/src/scene/field/`.
- [x] `W04.P11.S17` - Re-skin the layout picker, filter menu, settings popover, zoom cluster, and minimap to the graph boards; `frontend/src/app/stage/`.

## Wave `W05` - Integrate, harden, verify identical

Integrate all surfaces, run the full lint gate and test suite, harden, and verify each assembled surface is visually and functionally identical to its board, fixing every remaining divergence and backend regression.

### Phase `W05.P12` - Integration + full gate + tests

Wire all surfaces into the shell, run just dev lint frontend (exit 0) and vitest, fix regressions.

- [x] `W05.P12.S18` - Wire every rebuilt surface into the shell, run the full lint gate (exit 0) and the vitest suite, fix regressions; `frontend/src/app/`.

### Phase `W05.P13` - Visual verification identical

Per-board screenshot comparison of the running app against Figma; fix every residual divergence until identical.

- [x] `W05.P13.S19` - Compare each assembled surface against its Figma board screenshot and fix every residual divergence until identical; `frontend/src/`.

## Description

## Steps

## Parallelization

## Verification
