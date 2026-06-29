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
- `1013:4066` **StateBlock** (set — `Mode=Empty\|Degraded × Layout=Inline\|Block`, `Message` text prop; the old `515:1000` stub is now its `Mode=Empty, Layout=Inline` variant)

Existing (selected — the join is by name, so resolve any component by its React export):

| Node | Component | | Node | Component |
| --- | --- | --- | --- | --- |
| `634:2090` | CommandPalette | | `635:3196` | CanvasStateOverlay |
| `270:927` | CodeViewer | | `618:1966` | CategoryLegend |
| `319:1024` | HoverCard | | `838:3906` | FilterMenu |
| `636:1920` | FrontmatterHeader | | `283:1170` | DocHeader (set) |
| `807:3528` | DocTypeMark (set) | | `635:3190` | IconRail |
| `635:3126` | Inspector | | `635:2489` | KeyboardShortcuts |
| `545:1397` | LocationStrip | | `636:2144` | MinimapWidget |
| `636:2157` | Playhead | | `260:896` | PropertyRow |
| `879:4125` | RagOpsConsole | | `636:1947` | RailFilterField |
| `636:2152` | RangeSelect | | `650:1790` | SearchResultPill (set) |
| `635:3108` | SettingsDialog | | `636:2160` | Stage |
| `635:2503` | TimeTravelChip | | `635:3145` | WorkingSet |
| `849:3929` | BackgroundMenu | | `826:3833` | BottomSheet |
| `823:3859` | BottomTabBar (set) | | `635:2500` | BrowserModeToggle |
| `635:2470` | ConfirmDialog | | `319:960` | ContextMenuHost |
| `635:2492` | CreateDocButton | | `635:3130` | Dialog |
| `825:3819` | MobileTopBar | | | |

Sub-components (no standalone export) use the `_Parent/Part` form — e.g. `_BottomSheet/Handle`,
`_CategoryLegend/Chip`, `_ChangePill`, `_FeatureSearchField/*`, `_FilterBar`, `_GitStatusPill`,
`_LayoutSelector`, `_LensSelector`, `_MarkdownReader/CodeBlock`, `_Twisty`.

State-preview frames (dot-path `Component.state`):

- `847:3903` `FeatureSearchField.open`
- `652:1804` `SearchPaletteSurface.expanded` · `666:2038` `SearchPaletteSurface.expanded.doc` · `651:1771` `SearchPaletteSurface.list`

## How to tell current from stale next time

1. The live screen is the **AppShell** `455:1094` — the only full-shell 1472×940 frame.
2. Organizational boards are **`[Band] Topic`** (Foundations / Kit / Surface / Graph / Mobile /
   States). State boards (`[States] …`) hold the 4-mode previews.
3. Components are **bare-named == React export**; `_Parent/Part` are sub-components; dot-path
   frames (`Component.state`) are state previews.
4. The join is by NAME (see `README.md`): a node with no same-name React export is a
   sub-component, a state frame, or stale. There is no `component-map.json` registry.
