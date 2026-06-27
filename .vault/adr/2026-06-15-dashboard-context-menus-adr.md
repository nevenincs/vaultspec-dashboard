---
tags:
  - '#adr'
  - '#dashboard-context-menus'
date: '2026-06-15'
modified: '2026-06-15'
related:
  - "[[2026-06-15-dashboard-context-menus-research]]"
  - "[[2026-06-14-dashboard-command-palette-adr]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
  - "[[2026-06-14-dashboard-design-language-adr]]"
  - "[[2026-06-14-dashboard-iconography-adr]]"
---

# `dashboard-context-menus` adr: `context menus: standardised in-place action surface` | (**status:** `accepted`)

## Problem Statement

The dashboard has a universal *lifted* verb surface — the `Cmd/Ctrl+K` command palette —
but no *in-place* one. Every region renders rich domain entities the user selects, hovers,
opens, and expands (vault documents and code files in the left rail; the inspected node,
edges, events, and search results in the right rail; event marks on the timeline; nodes and
meta-edges on the graph stage), yet none offers a right-click menu of the actions valid on
the thing under the pointer. The verbs those entities support exist — they are buried inside
per-component `onClick` and keyboard handlers — but there is no standardised way to reach
them in place, and there is no shared notion of an "action" that a surface can declare once
and have appear everywhere it is reachable.

This ADR pins a single, project-wide **context-menu system** and, with it, makes **actions**
a first-class concept in the React stack. It standardises four things the brief names: the
**commands** (one shared action descriptor, not a per-surface bag of handlers), the
**command backend** (the existing `appDispatcher` seam — reused, never paralleled), the
**state system** (a small menu open-state concept plus a pure per-surface "information
context" resolver), and the **information context** each module contributes (the entity
descriptor under the pointer). It defines, per region, the menu contents, and the menu's
shape, size, visual rendering, and behaviour.

This is spec work. It re-decides nothing in the base design language, the iconography ADR,
the command-palette ADR, or the four-layer architecture; it inherits all of them. It does
authorise a new app-chrome surface and one additive scene-event seam, and it states the laws
that surface obeys. The build sequence lives in the plan.

## Considerations

The research (`2026-06-15-dashboard-context-menus-research`) established that the command
backend already exists and is the thing to standardise on. An **action** is a typed object
`{ type, payload?, meta? }` dispatched through `appDispatcher` (`platform/dispatch/`), which
runs a fixed trace → log → confirm-guard middleware chain; a terminal handler is registered
once per `type` and is the only side-effecting point; the React face is `useAction(type)`
and the arm-to-confirm `useConfirmable(type)`. The command palette already consumes this:
it builds a flat `PaletteCommand[]` (`{ id, label, family, run, confirm? }`), routes ops
through `dispatchOps` (the sole `engineClient`-touching handler) over the `OPS_WHITELIST`,
gates the ops family out of time-travel, and arms destructive verbs through the guard. A
context menu is the *in-place sibling* of the palette: the same object-then-action grammar,
the same backend, the same laws — only the surface differs (a small floating menu at the
pointer rather than a lifted modal).

The cohort the base design-language ADR follows (VS Code, Cursor, Zed, Linear, the agentic
desktops) converges on the same shape: **one generic menu host fed by commands contributed
against a context** (VS Code's `when`-clause `*/context` menus are the reference), the same
command reachable from palette and menu and keybinding, items grouped into intent sections
with destructive actions distinct and last, full keyboard operation
(`Menu`/`Shift+F10` opens, arrows move, Enter activates, Escape restores focus), and
**disabled-with-reason over hidden** for actions that exist but cannot run right now. This is
the structural answer to "standardise across all frontend modules": a single host plus
per-surface contribution, not N hand-rolled menus.

The inventory found every region already carries the verbs a menu would list, and that the
per-surface "information context" reduces to an **entity descriptor** the surface already
has in hand at event time (`{ kind, id, …fields }`): workspace / worktree / vault-doc /
code-file in the left rail; node / edge / event / search-result / changed-file in the right
rail; event-mark on the timeline; graph-node / meta-edge / island / empty-canvas on the
stage. The graph is the one special seam: its entities are PixiJS objects whose pointer
events reach React only through the locked `SceneController` event channel, which today
carries `hover`/`select`/`open`/`expand`/`pin` but no right-click.

Nothing context-menu exists in `frontend/src` today — no `onContextMenu`, no menu/popover
primitive, no floating-position utility, no menu library (bespoke chrome per the confirmed
stack). The whole UI layer is new; the backend and the laws are inherited.

## Constraints

- **Layer ownership (hard).** The menu is app-chrome. It reads stores through hooks and
  selectors and emits intent; it must never `fetch` the engine and never read the raw
  `tiers` block. Per-surface resolvers read store selectors only. This is the standing
  dashboard layer-ownership invariant, not a new rule.
- **One backend, through the seam (hard).** Every action that mutates state must dispatch
  through `appDispatcher`; the menu must never call `engineClient` directly. This extends the
  palette's `palette-ops-dispatch-through-the-seam` candidate from the palette to *all*
  action surfaces and is the load-bearing discipline of this ADR (see Codification).
- **Time-travel gating must generalise.** The palette gates the ops *family*; a menu exposes
  mutating verbs on many entity kinds, so the gate is expressed on the **action descriptor**
  (a `disabledInTimeTravel` flag) and applied by the resolver — never re-derived per menu —
  so a historical-mode mutation cannot leak through any surface.
- **Arm-to-confirm reuse.** Destructive items use the existing `useConfirmable`; the guard is
  single-slotted per action `type`, so distinct destructive items coexist, but the menu must
  track the armed item and disarm on close / navigate / outside-dismiss (the palette's
  `armedCommandId` pattern).
- **Scene contract is locked; extension is additive only.** The graph right-click is one new
  `SceneEvent` variant emitted scene→React; the scene gains *no* menu semantics and the menu
  host stays in app-chrome. Empty-canvas right-click is handled on the DOM container.
- **No new model, endpoint, or wire client.** The menu is a projection over the one model and
  a consumer of existing stores queries; it adds no node shape and no engine route.
- **Browser-native menu coexistence.** `onContextMenu` calls `preventDefault()` only where
  the app menu takes over; text inputs and selectable text keep the native menu (cohort
  convention).
- **Inherited visual law.** The surface renders on the semantic elevation tier with semantic
  tokens (no bespoke shadow, no borrowed hex), obeys the motion law (short, subtle, instant
  for keyboard, reduced-motion-safe), uses tabular numerals on any data text and monospace
  for identities/paths, and draws item marks from the two sanctioned families — Lucide for
  structural action glyphs, Phosphor for domain marks.
- **Parent-feature stability.** Every dependency is shipped and stable: the dispatch seam,
  the confirm guard, the ops handler/whitelist, the selection concept, the `SceneController`
  event channel, the token/elevation/motion layers, and the palette's focus-trap and
  live-region patterns. No frontier technology is involved.

## Implementation

The system is **platform chrome over the existing dispatch backend**, in six layers. Concrete
token values, class names, and code live in the plan and reference; this ADR pins behaviour
and law.

**1 — The shared action descriptor (standardised "commands").** The palette's `PaletteCommand`
is generalised into one **`Action`** descriptor consumed by both the palette and the menu:
`{ id, label, section, icon?, run | actionType+payload, confirm?, disabled?,
disabledReason?, disabledInTimeTravel?, accelerator? }`. An action is the native unit of the
verb system: declared once, reachable from the palette, the context menu, and (a pathway, not
this ADR) a keybinding; it either carries an imperative `run` (for store-only intents such as
select/pin/filter) or an `actionType` + payload dispatched through the seam (for mutating
verbs). `section` places it in an intent group; `confirm` routes it through arm-to-confirm;
`disabled*` express exists-but-cannot-run honestly. The palette is refactored to consume this
shared descriptor so the two surfaces cannot drift.

**2 — The command backend (standardised, reused).** No new engine. Mutating actions dispatch
through `appDispatcher` and resolve in a terminal handler registered on the seam — the ops
handler is the template, and new verb families (e.g. a clipboard/reveal/editor-open family)
register their own terminal handlers the same way. Store-only intents call the existing
store mutators (`selectNode`, pin store, filter store, working-set) directly, as the palette's
navigation/lens commands already do. The result is one auditable verb path: logged, traced,
guardable, time-travel-gated, and armed-to-confirm in one place.

**3 — The information-context resolver (standardised per-surface context).** Each surface
contributes a pure function `(EntityDescriptor, AppState) => Action[]`, mirroring the
palette's pure, unit-tested `buildCommands`. The `EntityDescriptor` is the `{ kind, id,
…fields }` the surface already holds at event time; `AppState` is the relevant slice
(time-travel mode, current selection, pin/open/working-set membership). Resolvers are
registered in one registry keyed by entity `kind`, so the menu host is generic and surfaces
*contribute* their actions — the VS Code contribution model adapted to this stack. The
resolver is where applicability, disabling, and gating are decided, once.

**4 — The menu open-state slice (standardised state system).** Because the menu is a
global-singleton chrome surface, its open state is a small view-store concept:
`{ open, anchor: {x,y}, descriptor, items, armedItemId }`. A surface opens the menu by
publishing the descriptor and the pointer point; the host renders the resolved items; any
dismiss path clears the slice and disarms. This keeps the menu a single instance (never two
open at once), keeps surfaces dumb (they emit "open menu for this entity at this point"), and
gives the keyboard path (`Menu`/`Shift+F10` on a focused row) the same entry as the pointer
path.

**5 — The menu host (the surface): shape, size, rendering, behaviour.** One floating
app-chrome component rendered in a portal above the canvas and chrome.
- *Shape & elevation.* A compact rounded panel on the modal/overlay step of the semantic
  depth tier — the same lifted treatment as the palette, expressed through elevation and
  surface tokens and the `[data-theme]` remap, with the soft low-contrast 1px rule and the
  consistent radius. A dimmed scrim is *not* used (a context menu is light-dismiss, not a
  modal); instead an invisible outside-click catcher dismisses.
- *Size & density.* Compact-but-breathing: a single column, ~12–16rem wide, items ~28–32px
  tall, max-height capped with internal scroll for long menus, intent **sections** separated
  by a thin rule, section labels in the muted-ink micro-treatment. Each row: a leading
  structural/domain mark (Lucide/Phosphor, 14px, grayscale-safe), the label, and a trailing
  inline affordance (the accelerator in the inline-shortcut treatment, or the ⏎⏎
  arm-to-confirm marker for destructive items) — the palette's row grammar reused.
- *Positioning.* Anchored at the pointer for right-click, or at the focused row's edge for
  the keyboard path; flipped and clamped to stay fully in the viewport; submenus (if any)
  open to the side with the same flip logic. Opening inside a scrolling rail dismisses on
  scroll rather than repositioning a stale anchor.
- *States.* Items render four honest states: enabled, disabled-with-reason (dimmed, the
  reason surfaced to assistive tech and on hover/focus), armed (destructive item flipped to a
  "confirm?" label), and a quiet empty state ("no actions") if a resolver returns nothing —
  never a dead surface.
- *Behaviour.* Right-click (or `Menu`/`Shift+F10`) opens; the menu captures focus and moves
  it to the first enabled item. Arrows move (skipping disabled and separators), Home/End
  jump, type-ahead matches a leading label, Enter/Space activates, ArrowRight opens a submenu,
  ArrowLeft/Escape closes it, Escape (or outside click, scroll, blur, another right-click,
  route/selection change) closes the whole menu and **restores focus** to the originating
  element. Activating a non-confirm item runs and closes; a confirm item arms on first
  activate (announced) and fires on second; moving off an armed item disarms. Motion is a
  short subtle open that collapses to instant under `prefers-reduced-motion`; keyboard
  activations never wait on animation.
- *A11y.* `role="menu"` with `role="menuitem"`/`menuitemcheckbox` and separators; a focus
  trap while open; focus restore on close; `aria-disabled` + reason for disabled items; a
  polite live region announcing the open menu's entity, the focused item, and the arm prompt
  — the palette's a11y contract transposed to the menu role.

**6 — The graph right-click seam (the one additive extension).** The `SceneEvent` union gains
one variant, `{ kind: "context-menu", id, target: "node" | "edge", clientX, clientY }`,
emitted by the PixiJS field on right-click of a node or edge; `Stage.tsx` consumes it and
opens the menu slice with the graph entity descriptor at the reported point. Right-click on
empty canvas is handled by an `onContextMenu` on the stage DOM container (fit/reset/layout/
working-set actions). Nothing else in the locked scene contract changes; the scene reports the
gesture, app-chrome owns the menu.

**Per-region menu contents (the defined inventory).** Each resolver returns sectioned actions;
*navigate/select* and *copy* are non-mutating and available in time-travel, *transform* and
*destructive* (mutating) are gated. The canonical first cut:

- *Left — workspace:* select; copy path; reveal; set launch default; remove from registry
  (destructive).
- *Left — worktree:* switch to scope; copy branch; reveal; refresh git status; filter rail to
  this scope.
- *Left — vault document:* focus on stage; open in editor; reveal; copy path / copy stem /
  copy node id; pin node.
- *Left — code file/dir:* focus linked node; open in editor; reveal; copy path; (dir:
  expand/collapse all).
- *Right — node (inspector):* focus on stage; open island; pin/unpin; copy id / copy title;
  expand ego.
- *Right — edge:* highlight on stage; copy id / relation / destination; filter to this tier.
- *Right — event:* zoom timeline to event; show/filter touched nodes; copy id.
- *Right — search result:* focus node; open in editor; reveal; copy source path / score.
- *Right — changed file / diff hunk:* open in editor; reveal; copy path / copy hunk.
- *Timeline — event mark:* zoom to event; jump to first touched node; show full node list
  (when truncated); copy id / timestamp.
- *Graph — node:* focus; open/close island; pin/unpin; expand/collapse ego; filter to node;
  reveal in left pane; copy id / title.
- *Graph — meta-edge:* highlight breakdown edges; filter to tier; copy summary.
- *Graph — island interior:* reload interior; copy id; close.
- *Graph — empty canvas:* fit to view; reset view; layout mode; clear working set.

Copy / reveal / open-in-editor are new small terminal verb families registered on the seam
(clipboard and a host-shell open), kept whitelisted exactly like ops.

## Rationale

The decision is to **reuse, generalise, and project**, not to build a parallel system. The
command backend, the confirm guard, the time-travel gate, and the a11y patterns already exist
and are proven on the palette; the context menu is the in-place projection of the same
object-then-action grammar onto the same backend. Generalising `PaletteCommand` into one
shared `Action` descriptor is what makes "standardise the commands" real — a single
definition reachable from every affordance — and it removes the only place the palette and a
new menu could drift. Routing every mutating verb through the one seam is what keeps the
no-direct-engine-bypass guarantee intact as the verb surface multiplies, and expressing the
time-travel gate on the descriptor (not per menu) is what stops historical-mode mutation
leaking as the surface grows.

The contribution model — a generic host fed by per-surface pure resolvers keyed on an entity
descriptor — is the cohort's settled answer (VS Code's contributed `*/context` menus) and the
direct structural response to "standardise across all frontend modules." It keeps every
surface a dumb view that emits "open menu for this entity here" while the actual menu, its
elevation, its a11y, its gating, and its arm-to-confirm live in one host. The single additive
`SceneEvent` respects the locked scene contract: the scene reports the gesture; app-chrome
owns the menu and all intent — exactly the layer boundary the architecture already settles.

Inheriting the base design language wholesale (elevation tier, semantic tokens, motion law,
Lucide/Phosphor split) is the on-trend, low-churn choice: the menu reads native to the
agentic-desktop cohort and shares the dashboard's token, motion, and icon layers for free.

## Consequences

- **Gains.** A standardised in-place verb surface across all four regions; one shared `Action`
  descriptor that unifies palette and menu and makes actions a native, declare-once concept; a
  single auditable verb path (logged, traced, guarded, gated, armed) as the surface
  multiplies; a generic host plus per-surface pure resolvers that new surfaces extend with no
  new architecture; full keyboard and assistive-tech operability inherited from the palette
  contract.
- **Costs and difficulties.** The whole menu UI layer is new (host, portal, positioning/flip,
  outside-dismiss, focus trap/restore) and the a11y obligations are real behaviour to verify,
  not a re-skin. Each surface needs a resolver and an entity descriptor wired at its event
  site, including the PixiJS right-click seam. New copy/reveal/open-in-editor verb families
  need terminal handlers and a whitelist, and host-shell "reveal/open in editor" may be a
  no-op or degraded affordance in a pure web context — it must degrade honestly. Positioning
  inside scrolling rails and at viewport edges needs care.
- **Risks.** The seam discipline is a discipline as much as a structure — a future menu action
  added without routing mutation through `appDispatcher` silently re-opens the bypass; a test
  asserting menu mutations transit the seam is the guard. The time-travel gate must stay on the
  descriptor or a new mutating item leaks into historical mode. The confirm guard's
  single-slot keying means the menu must disarm on every exit path or a stale arm survives.
  `preventDefault()` over-reach would steal the native menu from text inputs.
- **Pathways opened.** Once actions are a shared descriptor dispatched through one seam, a
  keybinding layer (the third affordance) drops in for free; new entity kinds get menus by
  registering one resolver; and the same descriptor can later feed inline toolbars,
  drag-actions, or a "recent actions" surface without re-authoring the verbs.

## Codification candidates

- **Rule slug:** `actions-dispatch-through-the-one-seam`.
  **Rule:** Every state-mutating action reachable from any verb surface — command palette,
  context menu, future keybindings — must be a shared `Action` descriptor dispatched through
  the `appDispatcher` seam and resolved in a registered terminal handler; no verb surface may
  call `engineClient` directly, and time-travel gating is expressed on the descriptor, not
  re-derived per surface. (Generalises the palette's `palette-ops-dispatch-through-the-seam`
  candidate to all surfaces; promote only after it has held across one full execution cycle.)
- **Rule slug:** `context-menus-are-resolved-from-an-entity-descriptor`.
  **Rule:** A surface contributes a right-click menu only as a pure
  `(EntityDescriptor, AppState) => Action[]` resolver registered by entity kind against the
  single menu host; surfaces never render their own menu, define their own elevation/a11y, or
  reach the wire — applicability, disabling, and gating are decided in the resolver. (Candidate;
  promote after the host and at least two surfaces prove it out.)
