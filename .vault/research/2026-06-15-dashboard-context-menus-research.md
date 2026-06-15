---
tags:
  - '#research'
  - '#dashboard-context-menus'
date: '2026-06-15'
modified: '2026-06-15'
related:
  - "[[2026-06-14-dashboard-command-palette-adr]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
  - "[[2026-06-14-dashboard-design-language-adr]]"
  - "[[2026-06-14-dashboard-iconography-adr]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #research) and one feature tag.
     Replace dashboard-context-menus with a kebab-case feature tag, e.g. #foo-bar.
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

# `dashboard-context-menus` research: `context menus: a project-wide action surface`

The dashboard has a universal *lifted* verb surface — the `Cmd/Ctrl+K` command
palette — but it has no *in-place* verb surface. Every region (the left rail, the
right rail, the timeline, the graph stage) renders rich domain entities the user can
select, hover, open, and expand, yet none of them offers a right-click menu of actions
scoped to the thing under the pointer. This research grounds a project-wide context-menu
system: what command backbone already exists to plug into, what the cohort of
agentic-desktop tools does, what entities each surface exposes and what actions they
already carry, and what is missing. The goal is to standardise four things at once — the
*commands*, the *command backend*, the *state system*, and the per-surface *information
context* — and to make "actions" a first-class, native concept in the React stack rather
than a per-component bag of `onClick` handlers.

The investigation read the platform dispatch layer (`frontend/src/platform/dispatch/`),
the command palette (`frontend/src/app/palette/CommandPalette.tsx`), the scene seam
(`frontend/src/scene/sceneController.ts`), and every interaction surface across the four
regions, plus the accepted base design-language, iconography, and command-palette ADRs.

## Findings

### F1 — There is already a command backend; it is the dispatch seam, and it is the thing to standardise on

The platform layer ships a complete action/dispatch pipeline that the context-menu system
must reuse wholesale rather than parallel. An **action** is a plain typed object
`{ type: string, payload?: P, meta?: ActionMeta }` (`platform/dispatch/dispatch.ts`). A
caller registers a terminal handler once with `appDispatcher.register<P>(type, handler)`
(returns a disposer) and invokes it with `appDispatcher.dispatch(action)`. Every dispatch
runs through a fixed middleware chain installed in `createAppDispatcher`: **trace**
(stamps a monotonic `traceId` + `ts` into meta for log correlation), **logging** (debug on
dispatch, error on handler throw, never swallowed), and the **confirm guard**
(`appConfirmGuard`). Dispatching an unregistered `type` throws `UnknownActionError`.

The React face is two hooks (`platform/dispatch/useAction.ts`): `useAction<P>(type)`
returns a `(payload?, meta?) => unknown` dispatcher bound to one type, and
`useConfirmable<P>(type)` returns `{ armed, trigger, cancel }` — the **arm-to-confirm**
primitive. The confirm guard is a single `Set<string>` of armed types keyed on the action
`type`: a first `trigger()` with `meta.guard === "confirm"` arms the slot and returns
`{ status: "armed", type }` *without calling the handler*; a second `trigger()` on the same
type disarms and runs the handler; `cancel()` disarms. This is exactly the destructive-op
safety the palette already uses.

The only terminal handler in the codebase today is the ops handler
(`app/right/opsActions.ts`): it registers `"ops:run"` and is the *sole* place that touches
`engineClient.opsCore` / `opsRag`; `dispatchOps(payload)` is its typed front. The verbs it
can run are the `OPS_WHITELIST` array in `app/right/OpsPanel.tsx` (`{ target, verb, label,
mark }`). The command palette consumes all of this: it builds a flat `PaletteCommand[]`
(`{ id, label, family, run, confirm? }`), routes ops through `dispatchOps`, gates the whole
ops family out in time-travel mode, and arms destructive verbs through `useConfirmable`.

**Implication.** The context-menu system does *not* need a new command engine. It needs (a)
a shared, reusable *action descriptor* — the palette's `PaletteCommand` shape generalised
out of the palette so both surfaces consume it — and (b) terminal handlers registered on
the same `appDispatcher`. This directly serves the brief's "standardise the commands and
the command backend": there is one backend, and it already exists.

### F2 — The palette is the cohort precedent; a context menu is its in-place sibling

The accepted command-palette ADR already pins the laws a verb surface in this product must
obey, and they transfer almost verbatim to a context menu: it is **app-chrome** bound by
layer ownership (reads stores through hooks/selectors, emits intent, never `fetch`es the
engine, never reads the raw `tiers` block); every operational verb dispatches **only**
through the `appDispatcher` seam (the codification candidate
`palette-ops-dispatch-through-the-seam`); destructive verbs are **arm-to-confirm**;
mutating verbs are **gated out in time-travel mode**; it must carry a real **a11y
contract** (labelled menu, focus trap/restore, full keyboard operability, live-region
announcements, reduced-motion honesty); and it renders on the **semantic elevation tier**
with semantic tokens, never bespoke shadow or borrowed hex.

The palette also settled an interaction grammar this system should inherit:
**object-then-action**. The palette names the target first (a feature, a lens) then
expresses the action on it. A context menu is the *purest* object-then-action surface — the
object is literally the thing under the pointer, and the menu is the set of actions valid on
that object. So the context menu is not a new pattern; it is the in-place projection of the
same grammar the palette already proves.

### F3 — The cohort (VS Code / Cursor / Zed / Linear / the agentic desktops) treats context menus as a registered, contextual, keyboarded command surface

The base design-language ADR names the convergent cohort the dashboard follows. Across that
cohort the right-click menu is not bespoke per widget; it is a single menu component fed by
**commands registered against a context**. The durable patterns worth adopting:

- **One menu, many contributors.** VS Code's model is the reference: a command is declared
  once, then *contributed* to menus by `when`-clause context (`editor/context`,
  `explorer/context`, `view/item/context`). The menu host is generic; surfaces contribute
  items. This is the structural answer to "standardise across all frontend modules" — a
  single host plus per-surface contribution, not N hand-rolled menus.
- **Commands are shared with the palette.** The same command that appears in the palette
  appears in the context menu (and can carry a keybinding). One command definition, three
  reachable affordances (palette, menu, accelerator). This matches the dashboard's existing
  `PaletteCommand` and argues for promoting it to a shared descriptor (F1).
- **Sections, not a flat list.** Menus group by intent (navigate / transform / copy /
  destructive) with separators, destructive actions visually distinct and usually last.
- **Fully keyboarded.** `Menu`/`Shift+F10`/`ContextMenu` key opens it on the focused item;
  arrows move, Enter activates, Escape closes and restores focus; submenus on
  ArrowRight. The cohort never ships a pointer-only menu.
- **Disabled-with-reason over hidden** for actions that exist-but-can't-run right now
  (mirrors the palette's "degradation is a designed state" stance); truly inapplicable
  actions are omitted.
- **Lifted, compact, fast.** A small floating surface on the modal/overlay elevation step,
  positioned at the pointer, flipped to stay in the viewport, opening with a short subtle
  motion that collapses to instant under reduced-motion.

No frontier technology is involved; the cohort builds these on the same primitives this
repo already has (a portal/overlay, a command list, a key handler).

### F4 — Inventory: every region renders right-clickable entities and already carries most of the verbs

Each surface already exposes the *intents* a menu would list — they are currently buried in
`onClick`/keyboard handlers. The menu's job is to surface them in-place plus a few obvious
adjacent verbs (copy / reveal / pin / filter-to). Grounded inventory:

**Left pane (`app/left/`).**
- *Workspace* (`WorkspacePicker.tsx`): select→`swap()`, add path. Adjacent: copy path,
  reveal, set launch default, remove from registry.
- *Worktree* (`WorktreePicker.tsx`): select→`setScope` + `movePlayhead("live")` +
  `putSession` (the 022 wholesale-reset path). Adjacent: copy branch, reveal, refresh git
  status, filter-to-scope.
- *Vault document* (`VaultBrowser.tsx`): click→`selectNode(entry)` (bidirectional rail↔stage
  focus); group disclosure. Adjacent: copy path/stem, reveal, open in editor, focus on
  stage, copy node id.
- *Code file/dir* (`CodeTree.tsx`): click→`selectNode()`; dir expand/collapse. Adjacent:
  copy path, reveal, open in editor, focus linked node.

**Right pane (`app/right/`).**
- *Selected node* (`Inspector.tsx`, read-only today): adjacent: copy id/title, pin/unpin,
  open island, focus on stage.
- *Edge row* (`Inspector.tsx`): click→`selectEdge(id)`. Adjacent: copy id/relation/dst,
  highlight on stage.
- *Event* (`Inspector.tsx`): selection of kind `event`. Adjacent: copy id, zoom timeline to
  it, show/filter touched nodes.
- *Search result* (`SearchTab.tsx`): click→`selectNode(node_id)`, roving nav. Adjacent: copy
  source path/score, open in editor, reveal.
- *Changed file / diff hunk* (`ChangesOverview.tsx`, `DiffView.tsx`): hunk-to-hunk nav.
  Adjacent: copy path, copy hunk, open in editor.

**Timeline (`app/timeline/`).**
- *Event mark* (`Timeline.tsx`): click→`selectEvent(id, node_ids)` (drives stage pulse).
  Adjacent: copy id/timestamp, zoom-to-event, jump to first touched node, show full node
  list (when truncated).
- *Playhead* (`Playhead.tsx`): drag/keyboard time-travel — primary interaction; little menu
  need beyond "return to live".

**Graph / stage (`app/stage/`, `app/islands/`, `scene/`).**
- *Graph node* (PixiJS): select / open island / expand ego / pin via the scene seam.
  Adjacent: copy id/title, pin/unpin, open/close island, expand/collapse ego, filter-to,
  reveal in left pane.
- *Meta-edge* (PixiJS): hover unfolds breakdown. Adjacent: copy summary, highlight breakdown
  edges, filter-to-tier.
- *Island interior* (`NodeInterior.tsx`, DOM): close. Adjacent: copy id, reload interior.
- *Empty canvas*: adjacent: fit-to-view, reset view, layout mode, paste/clear working set.

**Implication.** The per-surface "information context" the brief asks to standardise is the
**entity descriptor under the pointer** — an `{ kind, id, …fields }` shape each surface
already has in hand at event time. The menu contents are a pure function of that descriptor
plus current app state (time-travel, selection, pin state). This is the "information context
engine" to define once and reuse.

### F5 — The seam to the graph is special: PixiJS pointer events, not DOM right-click

For the three DOM regions, the menu opens from a native `onContextMenu` on the row/element,
which carries pointer coordinates and the entity descriptor directly. The graph stage is
different: nodes/edges are PixiJS objects, and pointer events flow back to React through the
**`SceneController` event channel** (`scene/sceneController.ts`) — `SceneEvent` already
carries `hover`, `select`, `open`, `expand`, `pin`. There is no `contextmenu`/right-click
event in that union today, and `hover` is emitted but currently unconsumed in `Stage.tsx`.

So the graph needs one additive seam extension: a `context-menu` `SceneEvent`
(`{ kind, id, clientX, clientY }`) emitted on right-click of a node/edge, plus a right-click
on empty canvas handled at the DOM container. This respects the locked scene-command
contract (events flow scene→React; the menu host lives in React/app-chrome) and the rule
that the stores/app layers own all wire and intent — the scene only reports the gesture.

### F6 — What is missing (the whole UI layer) and what is reusable

Nothing context-menu exists in `frontend/src` today: no `onContextMenu` handler, no
menu/popover/dropdown primitive, no floating-positioning utility, no `role="menu"`, no menu
library dependency (bespoke chrome, per the stack). The system must add, as new platform
chrome:

1. A **menu host / portal** — a single floating surface positioned at a point, viewport-
   flipped, dismiss-on-outside-click/Escape/scroll, on the elevation tier with semantic
   tokens. (Reuse the palette's focus-trap helper `focusablesOf` and its focus-restore
   lifecycle.)
2. A **shared action descriptor** generalised from `PaletteCommand` (`id`, `label`,
   `section`, `icon`, `run`/`actionType`, `confirm?`, `disabled?`/`disabledReason?`,
   `accelerator?`) — consumed by both palette and menu.
3. A **contextual-action resolver** per surface: `(EntityDescriptor, AppState) => Action[]`,
   pure and unit-testable (mirrors the palette's pure `buildCommands`).
4. A **menu open-state slice** (which menu, anchor point, entity, armed item) — a small
   view-store concept, since the menu is global-singleton chrome.
5. The **PixiJS right-click → `SceneEvent`** seam extension (F5).
6. The **a11y + keyboard + reduced-motion** contract, inherited from the palette ADR.

Reusable as-is: the entire `appDispatcher`/`useAction`/`useConfirmable`/confirm-guard
backend; the ops terminal handler and whitelist; the palette's focus-trap and live-region
patterns; the semantic elevation/token/motion layers; the Lucide (structural) /
Phosphor (domain) icon split for item marks.

### F7 — Risks and constraints surfaced

- **Seam discipline.** Any menu action that mutates must dispatch through `appDispatcher`,
  or it silently re-opens the no-direct-engine-bypass hole the palette ADR closed. A test
  asserting menu ops transit the seam is the guard.
- **Time-travel gating must generalise.** The palette gates the ops *family*; a context menu
  exposes mutating verbs on many entities, so the gate must be expressed on the action
  descriptor (`disabledInTimeTravel`) and applied by the resolver, not re-derived per menu.
- **Confirm guard is single-slotted per type.** Two destructive items in one menu key on
  their distinct action types, so they coexist, but the menu component must track which item
  is armed and disarm on close/navigate (the palette already solved this with
  `armedCommandId`).
- **Browser-native menu collision.** `onContextMenu` must `preventDefault()` only where the
  app menu takes over, leaving inputs/text with the native menu (the cohort convention).
- **Positioning at viewport edges** and inside scrolling rails needs flip/clamp; scroll or
  resize should dismiss, not reposition stale.
- **Layer ownership.** The menu is app-chrome; resolvers read stores selectors only. The
  graph seam reports gestures; it does not gain menu semantics.

## Recommendation

Build one standardised context-menu system as platform chrome over the existing dispatch
backend: a single menu host, a shared action descriptor promoted from `PaletteCommand`,
per-surface pure contextual-action resolvers keyed on an entity descriptor, a small menu
open-state slice, and a single additive `SceneEvent` for graph right-click. Make "action"
the native unit — defined once, reachable from palette, menu, and (later) keybinding,
dispatched through the one seam, arm-to-confirm and time-travel-gated by construction. This
is decided in the `dashboard-context-menus` ADR; the per-surface menu contents, the menu
shape/size/render/behaviour, and the build sequence follow there and in the plan.
