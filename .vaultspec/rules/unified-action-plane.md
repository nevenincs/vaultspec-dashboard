---
name: unified-action-plane
---

# Every UI element's actions are one descriptor enrolled across the four planes

## Rule

Every action a user can perform in the context of a UI element is authored as ONE
`ActionDescriptor` (`frontend/src/platform/actions/action.ts`) and enrolled,
unchanged, across the four existing planes — the **context-menu resolver registry**
(`platform/actions/registry.ts`, one pure `(entity, ctx) => ActionDescriptor[]`
per entity kind, registered in `app/menus/registerAll.ts`), the **keymap registry +
dispatcher** (`platform/keymap/registry.ts` + `stores/view/keymapDispatcher.ts`),
the **command palette** (`stores/view/commandPaletteCommands.ts`), and the **dispatch
seam** (`appDispatcher` → `stores/server/opsActions.ts` / `sessionActions.ts` /
store mutators). A verb that recurs across surfaces (relate, archive, the graph
camera verbs) is authored ONCE in a shared builder (`app/menus/sharedActions.ts`,
`stores/view/graphCommands.ts`) and composed by every surface — never re-derived per
surface. Each descriptor is BOTH a derived-state **consumer** (its `disabled` /
`disabledReason` / `label` / payload are computed from live state — the entity, the
injected `ActionContext.selectedNodeId`, the store snapshot) and a **producer** (it
mutates through the one seam: a store-only `run` or an appDispatcher `dispatch`, with
cache invalidation/watcher-refresh following). A bespoke per-surface button handler
that bypasses this plane is a defect; so is a context-menu/palette/keymap entry that
re-implements an action another surface already defines.

## Why

The four planes already existed (the keyboard-action-system campaign wired the
registry + dispatcher; the dashboard-context-menus campaign wired the resolver
registry), but actions were enrolled unevenly: the left rail had a rich set while the
graph, timeline, editor, and pickers had partial or bespoke-button-only coverage, and
the same verb (relate, archive) risked being re-authored per surface. The application-
wide action campaign (2026-06-20/21) drove a uniform set across every surface and
found the load-bearing disciplines: (1) cross-surface verbs MUST be centralized
(`relateToSelectionAction` / `archiveFeatureAction` are composed by the vault-doc row,
the graph node, and would-be editor menu from one source — a label or backend-verb
change lands once); (2) stores-layer planes (palette, keymap) that need an app-layer
capability (the scene controller) reach it through a registered bridge
(`sceneCommandBridge` mirrors the keymap-overrides reader) rather than importing across
the layer boundary; (3) selection-relative actions stay pure by reading
`ctx.selectedNodeId` threaded through the resolver context, never a store; (4) an action
the backend genuinely cannot perform (workspace set-launch-default — `is_launch` is the
auto-determined launch root, not user-settable) is REMOVED, not shipped as a permanently
disabled lie. The honest disabled-with-reason pattern is reserved for actions that are
real but inapplicable in the current context.

## How

- **Good:** a new surface needs an action → add it as a descriptor (in the per-kind
  resolver, and where useful a keymap def + palette command), computing `disabled`/
  `label` from the entity + `ctx`; route a mutation through the appDispatcher seam
  (`OPS_ACTION` / `SESSION_ACTION`) so it is logged/guardable and refreshes the cache.
- **Good:** a verb already exists on another surface → compose the shared builder
  (`sharedActions` / `graphCommands`), passing a surface-scoped `id`; do not re-derive
  the payload or the disabled logic.
- **Good:** a stores-layer plane needs the scene → call `runSceneCommand(...)`; the app
  registers the forwarder once at the shell top. Same shape for any future app→stores
  capability bridge.
- **Bad:** a bespoke onClick handler in a component that mutates without an
  `ActionDescriptor`, so the verb is unreachable from the palette/keymap and drifts from
  the menu copy.
- **Bad:** a second copy of relate/archive authored inline in a new resolver.
- **Bad:** a permanently-disabled action implying a capability the backend lacks — remove
  it (or file the backend verb) instead of shipping the lie.

## Status

CANDIDATE — promoted at the close of the first application-wide action enrollment
(2026-06-21). Per the codify discipline this binds once it has held across a full
subsequent cycle; recorded now because the disciplines (centralize cross-surface verbs,
bridge across layers rather than import, selection via ctx, remove non-capabilities) are
already load-bearing and were each found the hard way this campaign.

## Source

The application-wide action campaign (2026-06-20/21): the unified-action-system mandate
extending the keyboard-action-system and dashboard-context-menus campaigns across every
UI surface. Sibling rules `keyboard-shortcuts-bind-through-the-one-keymap-registry`,
`dashboard-layer-ownership` (the layer boundary the scene bridge respects),
`settings-are-schema-driven-from-one-registry`, `ui-labels-are-user-facing`.
