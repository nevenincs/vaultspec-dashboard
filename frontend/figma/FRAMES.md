# Figma frame inventory — binding file `SlhonORmySdoSMTQgDWw3w`

The binding file has a single page (`Components`, `0:1`). It is organized as
**`[Band] Topic` boards** (the figma-naming-contract organizational scheme), plus
**bare-named components** (a node's name equals its React export symbol) and
**dot-path state-preview frames** (`Component.state`). This inventory records the
CURRENT structure so a future agent updates the right node and does not chase stale ids.

> **Re-inventoried 2026-06-29** against the live file (65 top-level nodes). The prior
> tables — old AppShells `117:2` / `384:1004`, the Reader / Code-viewer studies
> (`245:738` / `247:738` / `248:738` / `249:740` / `100:2` / `101:2` / `309:1010`), and the
> review / QA clusters (`312:897`–`319:914`, `353:1027`) — were comprehensively stale and
> have been removed: **those nodes are gone**. The stale Timeline symbol `239:713` was also
> retired this session.

## The live screen

| Node | Name | Notes |
| --- | --- | --- |
| `455:1094` | **AppShell** (1472×940) | The dashboard screen — author the app to it. Contains the stage (`455:1109`) → the in-context timeline `993:4204` (FUTURE: swap for a `TimelineRange` instance during an AppShell recompose). |

## Organizational bands (`[Band] Topic` boards)

| Node | Board |
| --- | --- |
| `61:2` | [Foundations] Colour |
| `62:2` | [Foundations] Type & Metrics |
| `135:2` | [Kit] Components |
| `606:1779` | [Surface] Activity Rail |
| `698:2093` | [Surface] Left Rail |
| `981:4323` | [Surface] Timeline date-range (1280×44 surface board — distinct from the canonical `TimelineRange` component `1005:4203`) |
| `958:4878` | [Graph] Components |
| `957:5238` | [Mobile] Compact |
| `741:3141` | [Study] Graph Hover |
| `1072:4204` | [Surface] Authoring (authoring-surface epic: DocChrome mode toggle w/ kbd hints, heading comment affordance, diff section states, comment thread panel) |

## State boards (the 4-mode previews)

| Node | Board | Notes |
| --- | --- | --- |
| `957:5217` | [States] Timeline | Shows the 4 real modes — instances the `TimelineRange` variants (was 4× the retired stale `239:713`). |
| `947:8312` | [States] Activity Rail | |
| `957:5222` | [States] Rail & Settings | |
| `957:5229` | [States] Surface State Modes | |

## Canonical components / sets (name == React export)

New this session:

- `1005:4203` **TimelineRange** (set — `State=Typical\|Loading\|Degraded\|Empty`; variants `1002:4205` / `1003:4197` / `1004:4203` / `1004:4197`)
- `1013:4066` **StateBlock** (set — `Mode=Empty\|Degraded × Layout=Inline\|Block`, `Message` text prop; the old `515:1000` stub is now its `Mode=Empty, Layout=Inline` variant; the `Mode=Empty, Layout=Block` variant `1012:4060` carries the "New document" secondary CTA per authoring-surface D5)
- `1072:4277` **CommentThreadPanel** (set — `State=Populated\|Orphaned`; the reader's section comment thread, authoring-surface D2; lives on `[Surface] Authoring`)
- `635:2492` **CreateDocDialog** (renamed from the stale CreateDocButton; full dialog with the open corpus-fed Feature combobox, authoring-surface D6)

Existing (selected — the join is by name, so resolve any component by its React export):

| Node | Component | | Node | Component |
| --- | --- | --- | --- | --- |
| `634:2090` | CommandPalette | | `635:3196` | CanvasStateOverlay |
| `270:927` | CodeViewer | | `618:1966` | CategoryLegend |
| `319:1024` | HoverCard | | `838:3906` | FilterMenu |
| `636:1920` | FrontmatterHeader | | `807:3528` | DocTypeMark (set) |
| `635:3190` | IconRail | | `635:2489` | KeyboardShortcuts |
| `545:1397` | LocationStrip (retired in code — worktree-switcher-identity ADR) | | `636:2144` | MinimapWidget |
| `636:2157` | Playhead | | `260:896` | PropertyRow |
| `879:4125` | RagOpsConsole | | `636:1947` | RailFilterField |
| `636:2152` | RangeSelect | | `650:1790` | SearchResultPill (set) |
| `635:3108` | SettingsDialog | | `636:2160` | Stage |
| `635:2503` | TimeTravelChip | | `635:3145` | WorkingSet |
| `849:3929` | BackgroundMenu | | `826:3833` | BottomSheet |
| `823:3859` | BottomTabBar (set) | | `635:2500` | BrowserModeToggle |
| `635:2470` | ConfirmDialog | | `319:960` | ContextMenuHost |
| `825:3819` | MobileTopBar | | `635:3130` | Dialog |

Archived (React export deleted; nodes renamed `_archived/*` so the name-join no longer
matches): `635:3126` `_archived/Inspector`, `283:1170` `_archived/DocHeader` — both
superseded by the status rail (authoring-surface D7).

Sub-components (no standalone export) use the `_Parent/Part` form — e.g. `_BottomSheet/Handle`,
`_CategoryLegend/Chip`, `_ChangePill`, `_FeatureSearchField/*`, `_FilterBar`, `_GitStatusPill`,
`_LayoutSelector`, `_LensSelector`, `_MarkdownReader/CodeBlock`, `_Twisty`. New for
authoring-surface: `_DocChrome/ModeToggle` (`1072:4205`, View/Edit segments with registry-derived
kbd hints), `_MarkdownReader/HeadingCommentAffordance` (`1072:4214`, right-gutter comment button +
count chip), `_TreeBrowser/FeaturesHeader` (`1070:4189`, Features section header + scoped create
Plus). The vault-mode left-rail header Filter Row (`843:3862`) gained the "New Document Button"
IconButton; the `StepMark` set (`564:1922`) gained `State=CheckboxUnchecked|CheckboxChecked|
CheckboxPending` variants (the actionable plan-step checkbox, D1); the `Icon` set (`159:136`)
gained `Glyph=Comment` (`1070:4166`) and `Glyph=Diff` (`1070:4171`).

State-preview frames (dot-path `Component.state`):

- `847:3903` `FeatureSearchField.open`
- `652:1804` `SearchPaletteSurface.expanded` · `666:2038` `SearchPaletteSurface.expanded.doc` · `651:1771` `SearchPaletteSurface.list`

## Design-sync — authoring-surface epic (opened 2026-07-12, CLOSED 2026-07-13)

Every item below has been mirrored into the binding file; the divergence is retired.
The tables are kept as the record of WHAT was synced — current node ids live in the
inventory sections above. Corrections made while closing: the WorkspaceGhost CTA rides
`left-rail:new-document` (this section previously said `vault-doc:new`, which never
existed), and DocChrome had no prior Figma node — `_DocChrome/ModeToggle` was authored
new on `[Surface] Authoring` (`1072:4204`) rather than updated.

### Components / sub-components to retire from Figma

| Figma node | Name | Reason |
| --- | --- | --- |
| `635:3126` | **Inspector** | Superseded by the Status rail (`StatusTab`). The React component is deleted (authoring-surface D7). DONE: renamed `_archived/Inspector`. |
| `283:1170` | **DocHeader (set)** | Superseded by the inline `DocHeaderBlock` helper in `MarkdownReader` and the editorial metadata `FrontmatterHeader`. The right-rail `DocHeader.tsx` component is deleted (authoring-surface D7). DONE: renamed `_archived/DocHeader`. |

NowStrip had no standalone Figma component entry; the concept survives in the stores layer (`nowStrip.ts`) and is referenced only at the architectural level.

### New affordances mirrored into Figma (all DONE 2026-07-13)

**Plan-step checkbox rows (D1).** `PlanStepTree` step rows now contain a keyboard-operable checkbox inside the row focus zone. The checkbox is disabled in historical/as-of views. In-flight state (mutation pending) is reflected visually. Suggested home: extend the existing status-rail step-row sub-component or author `_PlanStepTree/StepRow.checked` / `_PlanStepTree/StepRow.inFlight` state frames inside `[Surface] Activity Rail` (`606:1779`).

**Heading comment affordance + count chip (D2).** Each rendered heading in `MarkdownReader` gains a right-side affordance: a comment icon button that is hover-revealed on pointer viewports and always visible on compact. When the section has comments, a count chip appears adjacent. Suggested home: author `_MarkdownReader/HeadingCommentAffordance` (with `state=hover|idle|compact` and `commentCount=0|n`) as a sub-component. The binding surface frame is `[Surface] Left Rail` or a new `[Surface] Reader` surface board.

**Section comment thread panel (D2).** `CommentThreadPanel` renders the full bounded thread for a heading section: a list of comment rows (actor ref + timestamp + body + resolve control), a compose field, and an orphaned-anchor warning row. Suggested component: `CommentThreadPanel` (bare-named == React export) with `state=empty|populated|orphaned`.

**Editor diff toggle + collapsible diff section (D4).** The editor toolbar gains a "Show diff" toggle button. When active, a collapsible `DiffLinesView` section appears above the textarea showing draft-vs-saved hunks. Suggested home: update the editor toolbar sub-component frame; author `_MarkdownDocView/DiffSection.open` / `_MarkdownDocView/DiffSection.closed` state frames.

**Accelerator hints on View/Edit toggle (D3).** The segmented View/Edit control in `DocChrome` displays keyboard shortcut hints (`⌘E` / `⌘⇧E`) in the control labels. Suggested home: update the existing `DocChrome` or segmented-control Figma node to show the hint text in label slots.

**New-document buttons — empty state (D5).** The workspace ghost/empty state (`WorkspaceGhost`) now contains a "New document" secondary button riding the shared `vault-doc:new` action descriptor. Suggested home: update the `StateBlock` component (`1013:4066`) `Mode=Empty` variant to include the call-to-action button.

**New-document Plus button in browser-region header (D5).** The browser-region header bar (vault mode) now contains a small Plus (`+`) icon button opening the create dialog. Suggested home: update the `[Surface] Left Rail` board (`698:2093`) to show the Plus in the header area.

**Features-section scoped Plus (D5, D6).** The Features fold-section header in `TreeBrowser` gains a Plus icon button that opens the create dialog with the feature field pre-focused. Suggested home: update `_FeatureSearchField/*` sub-components or author a `_TreeBrowser/FeaturesHeader` sub-component.

**Corpus-fed feature combobox in create dialog (D6).** The feature text field in `CreateDocDialog` is now an autocomplete combobox fed by the live corpus feature list. Free text is still accepted for new tags. Suggested home: author `_CreateDocDialog/FeatureCombobox` (with `state=closed|open|typing`); update the `CreateDocButton` component set (`635:2492`) to reflect the new input variant.

---

## How to tell current from stale next time

1. The live screen is the **AppShell** `455:1094` — the only full-shell 1472×940 frame.
2. Organizational boards are **`[Band] Topic`** (Foundations / Kit / Surface / Graph / Mobile /
   States). State boards (`[States] …`) hold the 4-mode previews.
3. Components are **bare-named == React export**; `_Parent/Part` are sub-components; dot-path
   frames (`Component.state`) are state previews.
4. The join is by NAME (see `README.md`): a node with no same-name React export is a
   sub-component, a state frame, or stale. There is no `component-map.json` registry.
