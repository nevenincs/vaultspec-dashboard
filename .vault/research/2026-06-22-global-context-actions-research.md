---
tags:
  - '#research'
  - '#global-context-actions'
date: '2026-06-22'
modified: '2026-06-22'
related: []
---



# `global-context-actions` research: `global context-menu tail + refresh state control`

Every right-clickable element in the dashboard gets a bespoke per-kind context menu
from the resolver registry, but there is no mechanism for actions that should appear
on **every** menu, and the one obvious universal state control — Refresh — exists only
as a palette command. This research grounds a proposed three-layer context-menu model
(bespoke per-kind body + a minimal global tail + a background/empty-space menu) against
the actual code, locates the exact seam a global tail must attach to, and establishes
what must be authored to make Refresh a shared action composed across the palette, a
chord, and the new tail. It binds to `unified-action-plane` (one descriptor enrolled
across planes) and `keyboard-shortcuts-bind-through-the-one-keymap-registry`.

## Findings

### F1 — The menu resolution flow has ONE convergence point, and no global-tail seam

Context-menu actions are produced by `resolveActions(entity, ctx)` in
`frontend/src/platform/actions/registry.ts` (≈L81-94): it looks up exactly one resolver
by `entity.kind`, normalizes + filters that resolver's output, then applies the
time-travel gate (`disabledInTimeTravel`). There is **no compose/merge step** — the
result is a single flat `ActionDescriptor[]`. The host (`ContextMenuHost.tsx`) reads the
resolved view from `frontend/src/stores/view/contextMenu.ts` (≈L341), which calls
`resolveActions` once, then `groupContextMenuActions` (≈L321-328) buckets the actions by
`section` and renders each section with a divider. Every surface opens menus through the
same `openContextMenu(entity, anchor)` → store → `resolveActions` path; the audit found
**no menu bypasses this seam**. So a global tail attached inside `resolveActions` (after
the per-kind resolution and the time-travel filter) reaches 100% of menus, inherits the
time-travel gate, and has `ActionContext` (incl. `selectedNodeId`) in hand. That is the
single correct seam; it does not exist yet and must be added.

### F2 — Sections are a closed 4-value set; the tail needs its own trailing section

`ActionDescriptor.section` is `"navigate" | "transform" | "copy" | "danger"`, rendered in
that fixed `ACTION_SECTION_ORDER` (`frontend/src/platform/actions/action.ts`). The tail
must render visually distinct and last, so the cleanest option is a new terminal section
(e.g. `"global"`) appended to the order, after `danger`, so the global tail is always the
bottom group under its own divider — never interleaved with a kind's own verbs.

### F3 — Refresh's light path already exists; it is just not a shared action

The palette command `reload:refresh-data` (family `reload`) in
`frontend/src/stores/view/commandProviders/reloadCommandProvider.ts` runs
`refreshAllEngineQueries()` (`frontend/src/stores/server/queries.ts` ≈L435-445), which
invalidates the workspace map + status + ~24 scoped query families for the active scope
(graph, filters, tree, history, prs, search, …). This is the **light refresh**:
client-only cache invalidation + refetch, non-mutating, time-travel-safe, no confirm. It
is currently authored INLINE in the provider — not a reusable `ActionDescriptor`, and it
has **no keyboard chord**. Per `unified-action-plane`, to put Refresh on the palette, a
chord, and the context-menu tail without drift, it must become one shared builder
(`refreshDataAction()`) keyed on one id (`reload:refresh-data`), with the provider, a new
`reloadKeybindings` `KeybindingDef`, and the tail all composing it. The
`actionCoverage.guard.test.ts` `DUAL_PLANE_VERBS` list is where a keymap+palette verb's
shared id is enforced.

### F4 — Heavy reload is correctly a separate ops verb; keep it out of the tail

The heavy reload — `useRagReindex()` → `dispatchOps({target:"rag", verb:"reindex"})` in
`frontend/src/stores/view/ragControl.ts` → engine `/ops/rag/reindex`, job-tracked,
confirm-guarded, `disabledInTimeTravel` — rebuilds the semantic index (heavy I/O, GPU).
It is a mutation-shaped ops verb and already lives in the palette/ops surface. It must NOT
go in the universal tail: a per-element right-click should never be one mis-click from a
full reindex. The tail carries only the light refresh.

### F5 — Backgrounds: the canvas has a menu; the rails and timeline do not

`canvasMenu.ts` is registered for the `canvas` entity (empty graph background) and offers
fit / reset-view / clear-selection / clear-working-set. The left/right rail empty space
and the timeline background have **no** context menu — only their rows/marks do. The
app-chrome escape hatches (open settings, keyboard-shortcuts legend, command palette,
reset layout) already exist as window/help/app verbs but are reachable only via the
palette/chrome. A background menu is where they belong on right-click; whether to add
rail/timeline background menus (beyond the existing canvas one) is an open scope question.

### F6 — What "always exposed for all" should mean: keep the tail at one verb

The dominant risk is tail bloat: a 5-item universal section visually drowns the 2 bespoke
verbs that matter on a given element. The research supports capping the always-on tail at
essentially **Refresh** alone (the one control meaningful regardless of what was clicked,
because the whole dashboard is a live view of a changing corpus). "Copy" is already
kind-specific (copy-id/path/hash), and settings/palette/shortcuts/reset-layout belong in
the background menu, not stapled to every node/edge/row. The decision rule to encode: if
the action's payload changes with the element → bespoke per-kind resolver; if it is
identical regardless of what was clicked → global tail; if nothing was clicked →
background menu.

## Open questions for the ADR

- **Tail section name + placement.** A new terminal `"global"` section after `danger`
  (recommended), versus reusing `danger` (semantically wrong) or prepending unsectioned.
- **Tail seam API.** `registerGlobalTailActions(resolver)` invoked inside `resolveActions`
  (registry-side, recommended) versus a host-side append in `contextMenu.ts`.
- **Tail membership.** Refresh only (recommended) versus Refresh + one or two more
  (e.g. command palette). Whether the tail is kind-agnostic or may suppress itself for
  some kinds.
- **Refresh chord.** Whether to bind one now (and which — `Mod+R` is browser-reserved,
  so e.g. `Mod+Shift+R` or a non-`Mod` key), or land the tail + palette first and defer
  the chord.
- **Background menus.** Whether to add rail/timeline background menus carrying the
  app-chrome set in this campaign, or scope to the global tail + the existing canvas menu
  and defer backgrounds.
- **Refresh scope.** Whether the tail's Refresh stays the blunt `refreshAllEngineQueries`
  (all scoped families) or a lighter targeted invalidation; the blunt sweep is simplest
  and already proven.
