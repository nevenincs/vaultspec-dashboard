---
tags:
  - '#plan'
  - '#figma-frontend-rewrite'
date: '2026-06-16'
modified: '2026-06-17'
tier: L3
related:
  - '[[2026-06-16-figma-frontend-rewrite-adr]]'
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

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #plan) and one feature tag.
     Replace figma-frontend-rewrite with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     tier is mandatory for new plans. Allowed: L1, L2, L3, L4.
     L1 = Steps only. L2 = Phases above Steps. L3 = Waves above
     Phases above Steps. L4 = Epic above Waves above Phases above
     Steps; PM association required. Pre-existing plans without this
     field default to L2.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'. The related field
     carries the AUTHORIZING documents (ADR, research, reference, prior
     plan) for every Step in this plan; Steps inherit this chain;
     per-row reference footers do not exist.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->


<!-- HIERARCHY AND TIERS:
     Epic > Wave > Phase > Step. Step is the canonical leaf-row
     noun. Execution Record artifact: <Step Record>.
     Tier is declared in frontmatter as tier: L1/L2/L3/L4
     (mandatory for new plans; pre-existing plans without the
     field default to L2 and the writer adds the field on first
     edit). The tier selects containers:
       L1 = Steps only.
       L2 = Phases above Steps.
       L3 = Waves above Phases above Steps.
       L4 = Epic above Waves above Phases above Steps; MUST declare
            a project-management association in the Epic intent
            block prose.
     Selection is by complexity criteria, not container counting.
     Writer never invents containers to qualify a tier. -->

<!-- IDENTIFIERS AND ROW CONTRACT:
     S##, P##, W## are flat, per-document, append-only, immutable.
     Promotion adds containers without renumbering. Gaps are not
     reused.
     Display paths are computed from current grouping:
       Step path:    L1 S##   L2 P##.S##   L3/L4 W##.P##.S##
       Phase heading:        L2 P##       L3/L4 W##.P##
       Wave heading:                      L3/L4 W##
     Row format:
       - [ ] `<display-path>` - imperative-verb action; `path/to/file`.
     Two-state checkboxes only ([ ] open, [x] closed). No per-row
     reference footers; wiki-links and markdown links are forbidden
     in plan body. Authorizing documents go in the plan's `related:`
     frontmatter once.
     ASCII spaced hyphens everywhere; em-dash (U+2014) and en-dash
     (U+2013) are forbidden. Step rows within a Phase are
     contiguous. -->

<!-- NO COMPRESSION:
     N self-similar actions = N rows. Never collapse into "for each
     X, do Y" / "across all callers, do Z" / "in every module,
     replace W". The rule applies at every tier including L1. -->

<!-- VAULTSPEC-CORE VAULT PLAN CLI:
     The `vaultspec-core vault plan` CLI is the canonical surface for
     structural manipulation of this plan document. Writers and
     executors MUST use `vaultspec-core vault plan step add/insert/move/
     remove/check/uncheck/toggle/edit`,
     `vaultspec-core vault plan phase add/move/remove/edit`,
     `vaultspec-core vault plan wave add/move/remove/edit`,
     `vaultspec-core vault plan epic intent`, and
     `vaultspec-core vault plan tier promote/demote` for every
     identifier-affecting change rather than hand-editing the row
     grammar. Hand edits are tolerated by the parser but flagged by
     `vaultspec-core vault plan check`; canonical-identifier preservation is
     guaranteed only when the CLI performs the mutation. Run
     `vaultspec-core vault plan --help` for the full subcommand
     surface. -->

# `figma-frontend-rewrite` plan

## Wave `W01` - Foundation: tokens + centralized component kit

Author the binding Figma variable set into the DTCG token source and regenerate the stylesheet (light/dark/HC peers, add Fraunces), then build every centralized component to the kit board so all surfaces compose from real shared definitions.

<!-- One-line headline summary plan. -->

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

- [ ] `W02.P04.S07` - Rebuild the LeftRail (workspace header, Vault/Tree/Code toggle, filter field, grouped document list); `frontend/src/app/left/`.

### Phase `W02.P05` - ActivityRail (244:753)

Status/Changes/Search tabs, context card, open-plans tree, recent commits.

- [ ] `W02.P05.S08` - Rebuild the ActivityRail (Status/Changes/Search tabs, context card, open-plans tree, recent commits); `frontend/src/app/right/`.

### Phase `W02.P06` - DocHeader (283:1170)

Document header surface.

- [ ] `W02.P06.S09` - Rebuild the DocHeader surface; `frontend/src/app/right/`.

## Wave `W03` - Stage, timeline, overlays, readers

Rebuild the stage chrome, the dual-lane timeline, the command palette / settings / context-menu / shortcuts overlays, and the reader-viewer family.

### Phase `W03.P07` - Stage chrome (toolbar/legend/zoom/minimap, NavControls 260:893)

Search+filter+layout toolbar, category legend, zoom cluster, minimap card.

- [ ] `W03.P07.S10` - Rebuild the stage chrome (toolbar, category legend, zoom cluster, minimap card, NavControls); `frontend/src/app/stage/`.

### Phase `W03.P08` - Timeline (dual-lane + scrubber)

Timeline label, date-range pills, steps&summaries switch, two event lanes, accent scrubber.

- [ ] `W03.P08.S11` - Rebuild the dual-lane Timeline with date-range pills, steps&summaries switch, and accent scrubber; `frontend/src/app/timeline/`.

### Phase `W03.P09` - Overlays (palette 94:2, settings 96:2, context-menu 98:2, shortcuts 104:39)

Command palette, settings dialog, context menu, keyboard-shortcuts surfaces.

- [ ] `W03.P09.S12` - Rebuild the CommandPalette and SettingsDialog; `frontend/src/app/palette/`.
- [ ] `W03.P09.S13` - Rebuild the ContextMenu and KeyboardShortcuts surfaces; `frontend/src/app/menu/`.

### Phase `W03.P10` - Readers and viewers (100:2/269:941, 101:2/248:738, DiffView 97:2)

Markdown reader (view/edit), code viewer, diff view, reader states.

- [ ] `W03.P10.S14` - Rebuild the Markdown reader (view and edit modes) and reader states; `frontend/src/app/viewer/`.
- [ ] `W03.P10.S15` - Rebuild the CodeViewer and DiffView; `frontend/src/app/viewer/`.

## Wave `W04` - Graph scene visual parity

Re-skin the scene's paint (node fills, grey edge rule, tier/state encodings, hover/selection, zoom cluster, minimap, layout/filter popovers) to the graph boards through the unchanged SceneController seam.

### Phase `W04.P11` - Node/edge/scene re-skin to graph boards

Category node fills, grey edge rule, tier/state encodings, hover/selection, layout picker, filter menu, settings popover, hero.

- [ ] `W04.P11.S16` - Re-skin node/edge paint (category fills, grey rule, tier/state encodings, hover/selection) to the graph boards; `frontend/src/scene/field/`.
- [ ] `W04.P11.S17` - Re-skin the layout picker, filter menu, settings popover, zoom cluster, and minimap to the graph boards; `frontend/src/app/stage/`.

## Wave `W05` - Integrate, harden, verify identical

Integrate all surfaces, run the full lint gate and test suite, harden, and verify each assembled surface is visually and functionally identical to its board, fixing every remaining divergence and backend regression.

### Phase `W05.P12` - Integration + full gate + tests

Wire all surfaces into the shell, run just dev lint frontend (exit 0) and vitest, fix regressions.

- [ ] `W05.P12.S18` - Wire every rebuilt surface into the shell, run the full lint gate (exit 0) and the vitest suite, fix regressions; `frontend/src/app/`.

### Phase `W05.P13` - Visual verification identical

Per-board screenshot comparison of the running app against Figma; fix every residual divergence until identical.

- [ ] `W05.P13.S19` - Compare each assembled surface against its Figma board screenshot and fix every residual divergence until identical; `frontend/src/`.

## Description

<!-- Briefly describe the proposed work. Reference `{adr}`s,
`{research}`, `{reference}`. Supporting documentation must be read prior to
writing the plan document. -->

## Steps

<!-- The plan's tier (declared in frontmatter as `tier: L1`, `L2`, `L3`, or
`L4`) determines the structure under this section:

- `L1`: a flat list of Step rows (no Phase, Wave, or Epic).
- `L2`: one or more `### Phase` blocks each containing Step rows.
- `L3`: one or more `## Wave` blocks each containing Phase blocks.
- `L4`: a `## Epic intent` block, followed by Wave blocks. -->

<!-- Replace this scaffold with the tier-appropriate structure for your plan.
Format examples for each block type are embedded below as commented
templates. -->

<!-- IMPORTANT: This document must be updated between execution runs to
     track progress. -->

<!-- PHASE BLOCK FORMAT (L2, L3, L4):
     ### Phase `P02` - rewrite the writer-agent contract

     One sentence stating what this Phase delivers.

     - [ ] `P02.S01` - imperative-verb action; `path/to/file`.
     - [ ] `P02.S02` - imperative-verb action; `path/to/file`.

     At L3/L4 the Phase heading uses the ancestor-aware path
     (### Phase `W01.P02` - ...). The intent sentence is mandatory. -->

<!-- WAVE BLOCK FORMAT (L3, L4):
     ## Wave `W01` - language-only convention rollout

     One paragraph stating what this Wave delivers, which downstream
     Wave depends on it, and which authorizing documents back it.

     ### Phase `W01.P01` - ...
     ### Phase `W01.P02` - ...

     The Wave intent paragraph is mandatory. -->

<!-- EPIC INTENT BLOCK FORMAT (L4 only):
     ## Epic intent

     One paragraph stating the strategic goal, the external project-
     management association (milestone name, project board identifier,
     roadmap entry), the timeline horizon, and the teams or agents
     involved.

     ## Wave `W01` - ...
     ## Wave `W02` - ...

     The ## Epic intent block is mandatory at L4 and absent at L1, L2,
     L3. The plan title (the level-one # heading at the top of the
     document) is the Epic title; no separate Epic heading is emitted. -->

## Parallelization

<!-- State which Steps, Phases, or Waves can be executed in parallel and
which carry hard ordering. At `L1` and `L2`, parallelism is decided
per-Step or per-Phase. At `L3` and `L4`, Waves are sequenced by
default (one Wave must land before the next can begin); Phases
within a single Wave may be parallelized when they share no hard
interdependency. -->

## Verification

<!-- State the mission success criteria for this plan. Each criterion
should be a verifiable check (test passes, surface conforms,
reviewer signs off) rather than a free-form assertion.

The plan is complete when every Step in the plan is closed
(`- [x]`). At `L4`, the Epic-completion check additionally requires
the declared project-management association to report the Epic
complete.

For tier-specific verification cadence, see the authorizing
documents linked in the `related:` frontmatter. -->
