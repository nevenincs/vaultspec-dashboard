---
tags:
  - '#reference'
  - '#figma-frontend-rewrite'
date: '2026-06-16'
modified: '2026-07-12'
related: []
---

# `figma-frontend-rewrite` reference: `binding Figma design extraction`

Extraction of the binding Figma file (key `SlhonORmySdoSMTQgDWw3w`, single page `Components`,
node `0:1`) consulted live through the Figma read MCP tools (`get_metadata`, `get_variable_defs`,
`get_screenshot`). The full machine-readable working copy — every token value, the component
variant matrix, the board node-ID map, and the AppShell layout breakdown — is persisted for the
build team at `tmp/figma-rewrite/DESIGN-SPEC.md`. This document is the durable grounding record;
builders confirm each surface against its node screenshot before declaring it matched.

## Summary

### Token foundation (from `get_variable_defs 0:1`)

Warm neutral ramp `neutral/0..980` (`#ffffff` → `#090705`, with `50 #fdfaf6`, `100 #f8f4ef`,
`150 #f4efea`, `200 #ebe6e0`, `300 #d5d0c9`, `400 #a9a49c`, `500 #8a857e`, `600 #706b64`,
`700 #5f5a53`, `800 #46423b`, `850 #312d28`, `900 #211d19`). Green accent ramp (`base #457650`,
`hover #154f27`, `pressed #0b441f`, `subtle #dff3e2`, `on-subtle #154f27`, `300 #dff3e2`,
`700 #75ae81`, `800 #99cda3`, `dark-subtle #1c3422`, `focus/ring #457650`). Diff pairs
(`add-l #137738` / `add-d #62bb78`, `remove-l #b33830` / `remove-d #e66f62`). Light semantic tier
(`surface/base #fdfaf6`, `surface/raised #ffffff`, `surface/sunken #f4efea`, `ink/body #312d28`,
`ink/muted #5f5a53`, `ink/faint #6f6a62`, `border/strong #d5d0c9`, `border/subtle #ebe6e0`).
Chrome tokens (`paper #fdfaf6`, `paper-aged #f9f0e5`, `paper-raised #ffffff`, `paper-sunken
#f4efea`, `accent-subtle #dff3e2`, `accent-text #154f27`, `state-live #3f774d`).

Scene / graph palette (the binding graph colours): `canvas-bg #fdfaf6`, `ink #312d27`,
`ink-muted #5f5a53`, `rule #ebe6e0` (edges), state `active #3f774d` / `archived #898581` /
`broken #ae4024` / `complete #5c5040` / `stale #9f7100`, status `graded #9f7100` /
`provisional #806a44` / `tiered #5c5040`, `tier-semantic #8b85b7`, and the per-doc-type category
fills `adr #8a72b5`, `audit #3f9aa6`, `code #b05a6b`, `exec #b5703f`, `feature #b3823c`,
`index #8f9a7e`, `plan #3f774d`, `research #4f7a9e`. Elevation shadows `Card` (`0 1`, blur 2,
`#0000000F`), `Popover` (`0 4`, blur 12, `#0000001A`), `Modal` (`0 12`, blur 32, `#00000029`).
Code syntax `keyword #9b4d6b`, `type #2f7d77`, `function #3a6ca6`, `comment #76695b`,
`string #5d7a48`.

Type system: `Fraunces` (serif) for titles/headings, `Inter` for UI/body, JetBrains Mono for
code. Reader roles — `Eyebrow` Inter Medium 11/1.3 +0.6, `Title` Fraunces SemiBold 34/1.12 -0.3,
`Dek` Fraunces Light-Italic 18/1.38, `Meta` Inter 12.5/1.4, `Lead` Inter 17/1.56, `H2` Fraunces
SemiBold 24/1.18, `Body` Inter 15.5/1.56, `Quote` Fraunces Italic 17/1.5, `H3` Fraunces SemiBold
17/1.28. Concrete gap: the current build imports only Inter and JetBrains Mono — `Fraunces` must
be added as a served face.

### Centralized component kit (board `Design System — Components` 135:2)

Button (Primary/Secondary/Ghost/Danger × Default/Hover/Disabled), IconButton (Default/Hover/Active),
Tab (Active/Inactive) and closable Tab variants, SectionLabel, Chip/Badge per category
(Decision/Audit/Code/Step/Topic/Summary/Plan/Research), SearchField, Card, ListRow (Default/Selected),
Switch (Off/On), SegmentedToggle + Segment, ProgressBar, Kbd, Slider (Default/Active), Divider
(Neutral/Accent), Breadcrumb, Tooltip, TreeRow (Collapsed/Expanded/Leaf), DropdownButton, StatusDot,
PropertyRow, CodeBlock, CodeViewer (View/Edit), and a glyph set (FolderPlus, Books, Hierarchy,
TreeStructure, Gear, Plus, Minus, File, Folder, ChevronRight, ChevronDown, Maximize, Crosshair,
PanelLeft, PanelRight, Calendar). Every surface composes from instances of these, never ad-hoc.

### Board node-ID map (owners for the rollout)

Foundations — Colour `61:2`, Type & Metrics `62:2`. Component kit — `135:2`. Graph/scene —
Hero `213:505`, Node-items `83:2`, Node-hover (typed) `110:2`, Layout picker `216:633`, Filter menu
`217:633`, Settings popover `88:2`, NavControls `260:893`. Shell — AppShell `117:2` (master), LeftRail
`244:750`, ActivityRail (right rail) `244:753`, DocHeader `283:1170`. Overlays — CommandPalette `94:2`,
SettingsDialog `96:2`, ContextMenu `98:2`, KeyboardShortcuts `104:39`, DiffView `97:2`. Readers —
MarkdownReader `100:2`, CodeViewer `101:2`, Reader `269:941`, Reader View `245:738`, Reader Edit
`247:738`, Reader states `271:1121`, Title-typeface options `249:740`, Code viewer full page `248:738`.

### Preserved data/scene contract (consumed unchanged by the rewrite)

The stores layer is the sole wire client: TanStack query hooks (`useGraphSlice`, `useVaultTree`,
`useFileTree`, `useFiltersVocabulary`, `useNodeDetail`, `useNodeNeighbors`, `useNodeContent`,
`useNodeEvidence`, `useDiscover`, `useEngineEvents`, `useEngineSearch`, `useTimelineLineage`,
`useGraphDiff`, `useGraphEmbeddings`, `useSession`, `useSettings`, the editing mutations, the
RAG-control hooks, `useWorkspaces`), the live-sync/degradation plane (`useGraphLiveSync`,
`useLiveStatusStore`, the `{data, tiers}` envelope read only through availability hooks), and the
zustand view stores (`useViewStore`, `useFilterStore`, `useLensStore`, `usePinStore`,
`useBrowserModeStore`, `useContextMenuStore`, `useSalienceLensStore`). The wire adapters
(`adaptGraphSlice`, `sliceToScene`, and the rest) fold the envelope. The `SceneController` is the
only React↔canvas channel: commands (`set-data`, `apply-deltas`, `focus-node`, `zoom-*`,
`fit-to-view`, `reset-view`, `set-visibility`, `set-selected`, `pulse`, `set-pinned`,
`set-layout-params`, `set-layout-mode`, `begin/end-interaction`, `set-frozen`,
`set-representation-mode`, `set-overlays`, `set-time`) and events (`hover`, `select`, `open`,
`expand`, `pin`, `camera-change`, `layout-changed`, `context-menu`, `representation-mode-changed`),
plus `trackNode` anchors and the `getLayoutState`/`getSelectionState`/`getRepresentationState`
reads. The FieldLayout seam and PixiField mount stay; only the scene's paint (node fills, the grey
edge rule, tier/state encodings, hover/selection treatment) is re-skinned to the graph boards.
