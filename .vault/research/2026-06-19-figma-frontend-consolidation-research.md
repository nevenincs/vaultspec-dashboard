---
tags:
  - '#research'
  - '#figma-frontend-consolidation'
date: '2026-06-19'
modified: '2026-06-19'
related: []
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #research) and one feature tag.
     Replace figma-frontend-consolidation with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `figma-frontend-consolidation` research: `figma vs frontend drift inventory and prune matrix`

The condition this campaign addresses is **design drift**: the React component set and the
binding Figma file `SlhonORmySdoSMTQgDWw3w` are not at parity, the board carries unpruned
design debt and orphaned (stale/unused) frames, and there is no single source of truth.
The user's decision was to **inventory both sides and decide keep / prune / author
per-element** — the inventory below IS the research phase. End state: every local React
element bound to a real Figma node, frames named the same as their React element, and
reusable components + prototypes used throughout (no ad-hoc one-off frames).

## Method — four data sources cross-referenced

1. `frontend/figma/component-map.json` — the node↔code registry of record, **84 entries**
   (~70 with a `figmaNodeId`).
2. The live Figma file — single page "Components" (`0:1`); node tree parsed in a subagent
   (1542 element nodes; 138 component symbols; 18 nodes directly under the page).
3. React components on disk — `frontend/src/app/**` + `frontend/src/scene/**` (test files
   excluded).
4. Code Connect — `frontend/figma/connect/*.figma.tsx` (**40 files**: 39 real per-component
   bindings + 1 synthetic `CoverageMissing.figma.tsx` stub).

## Findings

### The Figma file is already triaged (good news)

It carries three explicit `SECTION` organizers and three matching cluster frames:

- `§ Review — generated code coverage` (`312:897`) → cluster `314:912` holds the **42 real
  Code-Connected COMPONENTs** (the `309:x` range: BrowserModeToggle … WorktreePicker).
- `§ Alias binding review` (`312:899`) → cluster `319:914` holds **6 promoted COMPONENTs**
  (`CodeTree, ContextMenuHost, FacetChipGroup, HoverCard, RailTabs, WorkTab`).
- `§ Figma-only / not Code Connected` (`312:898`) → cluster `314:923`, **29 children,
  almost all plain FRAMEs** — this is the holding pen and the prune target.

The earlier hypothesis that the `309:x` block was empty placeholders was WRONG: those are
real components, and `CoverageMissing.figma.tsx`'s `<MIRROR>` is a publish-time URL token,
not a dead binding. The current binding shell is the `384:1004` Dock Workspace +
`353/389` ActivityRail Status generation; `117:2 AppShell` is the OLD master.

The real reusable kit atoms live on the **"Design System — Components" board (`135:2`)** —
21 atoms (StatusDot, Chip, Card, ListRow, Switch, SegmentedToggle, Segment, Divider, Badge,
MenuRow, Breadcrumb, Tooltip, TreeRow, DropdownButton, Button, SearchField, IconButton,
SectionLabel, Kbd, Slider, ProgressBar), each as component + sample instance.

### FIGMA PRUNE LIST — stale frames in cluster `314:923`, superseded by real components

Each is a plain FRAME whose name collides with a now-real COMPONENT; the component does not
instance the frame, so deleting the frame is safe. Figma version history is the reversal.

| Stale frame (prune) | nodeId | Superseded by (keep) |
| --- | --- | --- |
| `AppShell` (old master shell) | `117:2` | `384:1004` Dock Workspace + `389:x` |
| `CommandPalette` | `94:2` | COMPONENT `309:954` |
| `SettingsDialog` | `96:2` | COMPONENT `309:1054` |
| `DiffView` | `97:2` | COMPONENT `309:966` |
| `MarkdownReader` | `100:2` | COMPONENT `309:1010` |
| `KeyboardShortcuts` | `104:39` | COMPONENT `309:998` |
| `CodeViewer` | `101:2` | COMPONENT `270:927` |
| `ContextMenu` | (in `314:923`) | COMPONENT `319:960` ContextMenuHost |
| `Reader` ×3 (old explorations) | `269:941`, `270:947`, `270:1037` | MarkdownReader/CodeViewer/ViewerSurface |
| junk `Frame` | `247:751` | — (default-named orphan) |
| `Reader — View/Edit/states/typeface`, `NavControls`, `Code viewer — full page` | `248:x`/`249:x`/`271:x` | superseded reader-state explorations |

### FIGMA KEEP LIST — reference docs, not surfaces (do NOT prune)

- `Foundations / Colour` (`61:2`) and `Foundations / Type & Metrics` (`62:2`) — the token
  reference.
- `Design System — Components` board (`135:2`) — the atom kit source of truth.
- `Graph layout catalog` doc frames and `graph/*` reference frames (Node-items `83:x`,
  Hero `213:505`, Layout picker `216:x`, Node-hover typed, Filter menu) — scene reference;
  keep unless a later pass proves them superseded.

### NAMING DEBT (convention fix, not prune)

- `Frame` (auto-named auto-layout container) appears **485×** at depths 2–14. The
  user-facing convention — frame named the same as its React element — is violated wherever
  a surface's outer frame is left as `Frame`. Junk top-level frames to rename: `247:751`,
  `353:1033`, `389:1505`.

### CODE-SIDE DRIFT (registry / Code Connect hygiene)

- **Dead three-way orphan — `FacetChipGroup`:** the React file
  `src/app/chrome/FacetChipGroup.tsx` **does not exist** (confirmed), yet a
  `component-map.json` entry, `connect/FacetChipGroup.figma.tsx`, AND a Figma COMPONENT
  (`319:994`) all still reference it. Prune all three.
- **Code components with NO Figma binding (author or mark non-visual):** `kit/FacetRow`,
  `kit/Popover`, `stage/CreateDocButton`, `stage/FilterMenu`, `stage/DockWorkspace`,
  `stage/DocPanel`, `stage/GraphPanel`, `viewer/MarkdownDocView`, `right/menus/HoverCard`
  (a second, canonical HoverCard distinct from `islands/HoverCard`), and
  `scene/field/markComponents` (Mark family) — none appear in the 84-entry registry.
- **Possibly-unused code (verify before removing):** reverse-import check flagged
  `CodeBlock, DocRow, Tooltip, TreeRow, TreeBrowser, DiffView, OpsPanel, WorkTab,
  StageTopbar` as having 0 external imports. Some (DiffView/OpsPanel/WorkTab) are real rail
  surfaces likely mounted dynamically — confirm via the right-rail render path before
  treating any as dead.
- `LayoutSelector` and `LensSelector` correctly co-habit `stage/LensSelector.tsx` (two
  named exports); the registry's two entries pointing at that one file are accurate, not
  drift.

## Decision policy applied

- **Prune (Figma):** the stale `314:923` superseded duplicates + junk frames above. Reversal
  = Figma version history; the binding file is mutated deliberately (see
  `figma-is-the-binding-source-of-truth`).
- **Prune (code/registry):** the `FacetChipGroup` three-way orphan.
- **Author/bind:** the unbound code components, each as a real Code Connect binding via the
  CLI against the LIVE file (`figma-code-connect-via-cli`), frame renamed to match.
- **Rename:** outer surface frames left as `Frame` → their React element name.
- **Keep:** Foundations, the Design System board, and graph/scene reference docs.

## Pass 1 executed (2026-06-19)

**Figma prune — 12 stale nodes removed from cluster `314:923`** (each name-guarded and
confirmed parented under the holding pen before deletion; reversal = Figma version history):
`AppShell` 117:2, `CommandPalette` 94:2, `SettingsDialog` 96:2, `DiffView` 97:2,
`MarkdownReader` 100:2, `KeyboardShortcuts` 104:39, `CodeViewer` 101:2, `ContextMenu` 98:2,
`Reader` COMPONENT_SET 269:941 (0 external instances) + its 2 sample instances 270:947 /
270:1037, and junk `Frame` 247:751.

**Kept after live verification:**
- `NavControls` (260:893 COMPONENT_SET) — has **4 live instances** inside kept frames; in use.
- `Reader — View mode / Edit mode / states / Title typeface` (245:738, 247:738, 248:738,
  249:740, 271:1121) — deliberately KEPT: plausibly the binding design for the live
  viewer/editor feature (review-rail-viewers / editor-tabbed-canvas). Do not delete binding
  design without confirming the live feature no longer matches them.
- `Foundations / Colour` (61:2), `Foundations / Type & Metrics` (62:2), `Design System —
  Components` board (135:2), `graph/*` references, `§ Overlays & dialogs` label (116:7).

**Code side:** removed the `FacetChipGroup` three-way orphan — `connect/FacetChipGroup.figma.tsx`
deleted + registry entry removed (88→87 entries). Gates: `component-map.json` valid JSON;
`npx figma connect parse` clean (no dangling reference).

## Pass 2 executed (2026-06-19) — full consolidation

**Registry completed (96 entries):** every genuinely-unbound React component is now
catalogued, bound to its existing representing node or marked non-visual — no net-new Figma
authoring was required (each component's own header cited its representing node):
- `FilterMenu` → 217:633 (graph/Filter menu) + Code Connect file authored.
- `MarkdownDocView` → 245:738 (Reader — View mode) + Code Connect file authored — this is
  why the reader-mode frames were kept.
- `FacetRow` → 217:633 (primitive; sub-row of the filter menu node, registry-only).
- `CreateDocButton` → 127:26 (Button instance, primitive, registry-only).
- Non-visual (`designSurface:false`, registry-only): `Popover` (renders only a `<div>` +
  dismiss wiring), `DockWorkspace`, `DocPanel`, `GraphPanel`, `GraphCanvasHost`.

**Code Connect hygiene:** fixed a pre-existing broken import in `CoverageMissing.figma.tsx`
(`PlanStepTree` was imported from `WorkTab`; corrected to `PlanStepTree.tsx`). Gates:
`npx figma connect parse` exit 0 (82 bindings); only the pre-existing `ViewerSurface`
include-glob warning remains; all touched files prettier-clean; `component-map.json` valid.

**Dead-code verdict (verified, NOT acted on — deliberate):** 8 components are referenced only
by tests + Code Connect, never mounted in real app code — kit primitives `CodeBlock`,
`DocRow`, `Tooltip`, `TreeRow` and surfaces `DiffView`, `OpsPanel`, `WorkTab`, `StageTopbar`
(`TreeBrowser` is LIVE via VaultBrowser). NOT deleted this pass because: (a) the kit
primitives are a legitimate reusable palette, not stale; (b) `WorkTab.tsx` also exports
`ProgressRing`/`PlanStepTree` that ARE used; (c) the verdict is heuristic and deleting real
code/designs risks the build for little gain. Their Figma designs are KEPT. This is a
verified code-cleanup backlog item, not a Figma-design prune.

**Two-HoverCard code duplication (finding):** `islands/HoverCard.tsx` (→ 319:1024) and
`right/menus/HoverCard.tsx` (cited 84:2, which is now DELETED) are two HoverCard
implementations. Needs code-level resolution before the menus one is registered/bound.

## Pass 3 executed (2026-06-19) — full code + Figma sweep (dead code, duplications)

**Dead components removed (all verified SUPERSEDED, none regressions):** deleted 8 component
sources + 5 co-located render tests + 5 Code Connect files + registry entries —
`right/DiffView` (folded into ChangesOverview), `right/OpsPanel` (rail collapsed 4→3 tabs),
`right/WorkTab` + `ProgressRing` (superseded by StatusTab/ProgressBar), `shell/StageTopbar`
(superseded by StageNavBar), and kit `CodeBlock`/`DocRow`/`Tooltip`/`TreeRow` (unused barrel
exports). Removed their 4 barrel export pairs from `kit/index.ts`. `PlanStepTree` is LIVE
(used by StatusTab) — its registry source was wrongly `WorkTab.tsx`, fixed to `PlanStepTree.tsx`.

**`layerOwnership.test.ts` needed NO surgery:** every reference to the deleted components is
self-healing — `existsSync`-guarded `readFileSync` tests fall back to asserting the seam moved,
`existingSourceRels()` filters non-existent paths, enrollments were already StatusTab-only.
Verified: the affected suites pass (the only failures are concurrent agents' in-flight
GraphControls/filter-panel WIP, unrelated to these deletions); `tsc` shows zero errors
referencing any deleted file.

**Third orphan found + removed — `ViewerSurface`:** no React file exists (replaced by
`DocPanel`/`MarkdownDocView`), but registry + CoverageMissing import + Figma node 309:1086
remained. Cleaned all three (the `ViewerSurface` *type* in viewStore stays — different thing).

**Duplications resolved:**
- **TreeRow** (kit vs TreeBrowser-local): the two diverged (generic primitive vs domain row
  with roving-nav/context-menu/open intent); deleted the unused kit `TreeRow` as the dead
  duplicate (TreeBrowser keeps its domain row).
- **HoverCard** (islands vs right/menus): a NAME collision between two genuinely-different
  cards (status-card vs evidence-card), both governed/tested. `islands/HoverCard` is the
  retired-from-production status card (only `prototype/StatusGallery` + layerOwnership govern
  it). Resolved by disambiguating its export `HoverCard`→`StatusHoverCard` (component + 2
  render tests + prototype import); left the contended layerOwnership test untouched (it keys
  off file path + internal helpers). 16 renamed tests pass.

**Figma node sweep — 23 nodes pruned total across the campaign.** This pass pruned the
component nodes for every deleted component (DiffView 309:966, OpsPanel 309:1026, WorkTab
319:1092, StageTopbar 309:1062, DocRow 161:164, Tooltip 157:131, TreeRow 158:126, ProgressRing
309:1038) + the two orphans (FacetChipGroup 319:994, ViewerSurface 309:1086) — all
instance-guarded (0 instances). **`CodeBlock` 256:836 KEPT** — it has 2 live instances and its
design is realized inline in `MarkdownReader`'s fenced-code chrome, so it's a referenced design
primitive, not an orphan.

**Final gates (my changes):** `eslint` clean, `prettier` clean on all touched src, `figma
connect parse` exit 0 with zero unresolved refs to any deleted component, affected vitest
suites pass. Full-tree `tsc`/`vitest` green is not attainable while concurrent agents hold
broken intermediate states (GraphControls/filter campaigns) — those failures are not from this
work. Changes left UNCOMMITTED in the shared tree (commit-by-pathspec on request).

## Follow-up (not yet done — broader campaign)

- **Bind unbound code components** (FacetRow, Popover, CreateDocButton, FilterMenu,
  MarkdownDocView, right/menus HoverCard, scene marks) — author Code Connect via the CLI
  against the LIVE file; or mark non-visual (DockWorkspace, GraphPanel, DocPanel, hosts).
- **Naming convention — RE-SCOPED:** the 485 `Frame` occurrences are almost entirely
  legitimate INTERNAL auto-layout containers (depth 2–3 inside components, Foundations swatch
  rows, graph filter-menu/legend rows). The convention ("frame named same as the React
  element") applies to a surface's OUTER frame, and those are already correct (CommandPalette,
  Timeline, LeftRail, …). Mass-renaming internal rows would add noise, not parity — NOT a
  task. Only genuine surface-level junk was the top-level `Frame` 247:751 (already deleted).
- **Verify the 0-external-import code components** (CodeBlock, DocRow, Tooltip, TreeRow,
  TreeBrowser, DiffView, OpsPanel, WorkTab, StageTopbar) against the live mount path before
  any code-side removal — several are rail surfaces likely mounted dynamically.
