# Figma frame inventory — current vs stale (binding file `SlhonORmySdoSMTQgDWw3w`)

The binding file has a single page (`Components`, `0:1`). This inventory records which
top-level frames are the **current** binding screens, which are **design explorations**
(reader/code-viewer variants, not full screens), and which clusters are **review/QA
scaffolding** — so a future agent updates the right frame and does not chase stale protos.
There is **one** AppShell lineage; no duplicate/abandoned AppShell exists to retire.

## Current binding screens (author code to match these)

| Node | Name | State it represents |
| --- | --- | --- |
| `117:2` | **AppShell** | The dashboard, **graph-only** state — no document open, graph fills the centre stage. |
| `384:1004` | **AppShell — Dock Workspace (docs left · graph right)** | The dashboard **docked** state (editor-dock-workspace, 2026-06-18) — a document is open, so documents tab to the LEFT, the graph stays RIGHT. Added 2026-06-18; titled + captioned on canvas. **Composed entirely from prototypes (no ad-hoc elements):** the documents column is a **Reader** (`269:941`, `Mode=View`) instance under a tab bar of **Tab** (`135:14`, `State=Active/Inactive`) instances on the shared `surface/base` background; the graph has a SINGLE tab so it shows NO tab bar; the collapsed left **icon-bar** is hidden (it must only show when the rail is collapsed — never doubled with the open rail). |

`117:2` and `384:1004` are the **two states of the same dock workspace** and are both
current. `384:1004` carries an on-canvas title (`389:1497`) and caption (`389:1498`).

## Design explorations (reader/viewer content, NOT full screens)

These are component/variant studies that the dock workspace now composes; they are
current as *content* references but are not full-screen prototypes:

| Node | Name |
| --- | --- |
| `245:738` | Reader — View mode |
| `247:738` | Reader — Edit mode |
| `248:738` | Code viewer — full page |
| `249:740` | Reader — Title typeface options |
| `100:2` / `309:1010` | MarkdownReader (component / Code-Connect tile) |
| `101:2` / `270:927` | CodeViewer (component / Code-Connect tile) |

## Review / QA scaffolding (not screens — do not author code to these)

| Node | Name |
| --- | --- |
| `312:897` / `314:912` | § Review — generated code coverage (cluster) |
| `312:898` / `314:923` | § Figma-only / not Code Connected (cluster) |
| `312:899` / `319:914` | § Alias binding review (cluster) |
| `309:9xx`–`319:xxx` | 250×156 Code-Connect placeholder tiles (one per surface) |
| `353:1027` | ActivityRail · Status — REDESIGN (in-progress study) |

## How to tell current from stale next time

1. The binding screens are the **AppShell** frames (`117:2`, `384:1004`) — the only
   full-shell 1472×940 frames. Everything else is a component, a content study, or a
   review cluster (the `§ …` sections).
2. The join is by NAME (see `README.md`): a component's Figma name equals its React
   export symbol. There is no `component-map.json` registry — a node with no same-name
   React export is a sub-component (`_Parent/Part`), a study, or stale.
3. The 250×156 tiles under the `§` clusters are **legacy Code-Connect QA scaffolding**
   (Code Connect was removed) — stale placeholders, never screens; safe to ignore/delete.
