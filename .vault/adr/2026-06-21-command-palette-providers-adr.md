---
tags:
  - '#adr'
  - '#command-palette-providers'
date: '2026-06-21'
modified: '2026-06-22'
related:
  - "[[2026-06-21-command-palette-architecture-research]]"
---

# `command-palette-providers` adr: `schema-driven command contribution registry` | (**status:** `accepted`)

## Problem Statement

The Cmd+K command palette assembles its command list by hand. The stores read model
`useCommandPaletteCommandView` (`frontend/src/stores/view/commandPaletteCommands.ts`)
calls ~15 hooks and concatenates the output of nine `buildX()` builder functions into
one flat array, then gates and filters it. Adding any command means editing that one
mega-file and threading another hook into its dependency array. There is no contract a
surface can enroll a command against, no programmatic population, and — because the
builders pull straight from corpus vocabulary — the standing list is saturated with one
`go to <feature>` and one `archive feature: <feature>` per feature tag (research finding
F2). The palette is, in the campaign framing, "a shell and an idea rather than a designed
interface."

This is the first ADR of the `command-palette-architecture` cluster. It decides the
*contribution architecture*: how commands get into the palette. The sibling
`command-palette-planes` ADR decides the search/open planes; the
`command-palette-actions` ADR decides the verb taxonomy, shortcuts, and backend feed.
This ADR supersedes the prior `2026-06-14-dashboard-command-palette-adr`'s two load-bearing
stances — "navigation contributes one entry per feature tag" and "the palette did not
need re-architecting" — both of which this campaign reverses.

## Considerations

- **The provider pattern already exists next door (research F3).** The context-menu
  resolver registry (`frontend/src/platform/actions/registry.ts`) is exactly the model
  the palette lacks: a pure `(entity, ctx) => ActionDescriptor[]` resolver registered once
  per entity kind, a generic host (`resolveActions`), the time-travel gate applied
  centrally, and surfaces self-registering by side-effect import collected in
  `frontend/src/app/menus/registerAll.ts`. The `unified-action-plane` rule already names
  the command palette as one of the four planes — the palette is the only plane that does
  not consume a registry. The decision is to give it one in the same shape, not to invent
  a new mechanism.
- **The descriptor already generalizes.** A palette command is `ActionDescriptor` + a
  `family` grouping — encoded today as `PaletteCommand`. A `CommandDescriptor` is that same
  shape, so providers emit the unit every other plane already speaks; no parallel type.
- **Corpus is data, not commands.** The dominant noise is corpus vocabulary enrolled as
  standing verbs. The fence belongs in the architecture: the command plane carries only
  real app verbs; corpus navigation moves to the document-search plane (decided in the
  sibling planes ADR). A structural guard makes the fence mechanical, mirroring
  `filterConsolidation.guard.test.ts`.
- **Granularity: one provider per surface, not per family.** A provider maps to an owning
  surface (left rail, graph, timeline, editor, window/shell, ops) so ownership tracks the
  `dashboard-layer-ownership` map; a provider may emit commands across several families.
  The alternative (one provider per family) splits a single surface's verbs across modules
  and was rejected.
- **Purity and testability.** Providers are pure `(ctx) => CommandDescriptor[]` functions
  of an injected `CommandContext` (the snapshot a provider may read: active scope, shell
  frame, time-travel flag, graph-frozen, etc.), never reaching a store directly — mirroring
  the resolver registry's purity split so each provider is unit-tested without React.

## Constraints

- **Parent features are mature and shipped.** This builds on the `ActionDescriptor` plane
  (dashboard-context-menus), the keymap registry + dispatcher (keyboard-action-system), and
  the existing `commandPalette` store/mode model — all shipped and stable. The change is
  additive: a new registry module plus a refactor of the assembly hook to consume it; the
  builder functions become providers, preserving their tested cores.
- **Layer ownership.** The registry is platform/stores substrate; providers live where
  their surface lives (`app`/`stores`) and read state through the injected context or stores
  selectors, never `fetch` the engine and never read raw `tiers`
  (`dashboard-layer-ownership`, `views-are-projections-of-one-model`).
- **No selector-returns-fresh-ref regressions.** The assembly hook must select raw stable
  state and derive the command list in `useMemo` (`stable-selectors`); the registry's
  `resolveCommands` is a pure function over the context snapshot, memoized on it.
- **Bounded by default.** The registered-provider map and any recents/MRU accumulator carry
  explicit caps at creation (`bounded-by-default-for-every-accumulator`); the existing
  `COMMAND_PALETTE_SOURCE_ITEMS_CAP` discipline is retained for any bounded list a provider
  emits.
- **Seam discipline preserved.** Mutating verbs still dispatch through `appDispatcher`
  (`palette-ops-dispatch-through-the-seam`); the registry does not become a second dispatch
  path.

## Implementation

A `CommandProvider` is a pure `(ctx: CommandContext) => CommandDescriptor[]`. A new
platform/stores **command-provider registry** module holds a bounded map of registered
providers keyed by a stable provider id, exposes `registerCommandProvider(id, provider)`
returning a disposer (mirroring `registerKeyAction` / the resolver registry), and a generic
`resolveCommands(ctx)` that calls every registered provider, concatenates the descriptors,
applies the central gates (time-travel removal of `disabledInTimeTravel` verbs,
degradation-from-tiers disabling, the query filter, family grouping), and returns the
bounded, ordered view the palette renders.

`CommandContext` is the read snapshot a provider is allowed to see — active scope, the
shell-frame booleans, the time-travel flag, graph-frozen, the live keybinding map (so each
command's inline shortcut is *derived* from the keymap registry by shared `id`, never
hand-typed). It is assembled once per render by the stores assembly hook from raw stable
selectors and passed in, keeping providers pure.

The nine existing builders are re-expressed as providers, one per owning surface: a
left-rail provider, a window/shell provider, a graph provider, a timeline provider, an
editor provider, a settings provider, and an ops provider. Each keeps its already-tested
pure core; the change is that it registers itself against the registry rather than being
hand-called inside the mega-hook. A central `registerAllCommands` module (mirroring
`registerAll` for menus) imports them once so registration is deterministic and one place
owns the provider set.

The corpus fence is structural. The per-feature `go to` and `archive feature` entries are
*removed from the command plane* — feature/document navigation is served by the
document-search plane (sibling ADR), and archive becomes an entity verb on a feature
(context menu + confirm), not 128 standing commands. A guard test asserts no registered
provider emits an id in the corpus-derived shape (`nav:<tag>`, `archive:<tag>`,
`lens:<name>` as standing commands), so the fence cannot silently regress.

The assembly hook `useCommandPaletteCommandView` shrinks to: build the context from raw
selectors, call `resolveCommands(ctx)` in a `useMemo` keyed on the context, and return the
grouped/ordered presentation view. The palette component is unchanged — it still consumes
the same view shape.

Concrete signatures, the `CommandContext` field list, the registry module surface, and the
provider migration map are code-level detail captured in the campaign's reference document,
not here.

## Rationale

The research is decisive (F1–F3): the costly substrate — a generic host fed by pure
per-surface contributions, with central gating and deterministic registration — already
exists for the context menu and is already proven. Giving the palette the same registry is
the low-novelty, high-consolidation move the design-system, filter-consolidation, and
keyboard-action cycles each applied to their domains: one contract, many contributors. It
makes adding a command a one-module enrollment instead of a mega-hook edit, makes the
corpus fence mechanical instead of a matter of vigilance, and lets the four action planes
(menu, keymap, palette, dispatch) finally share one contribution discipline — the
`unified-action-plane` rule's intent realized for the plane that was lagging. Keeping the
descriptor identical to `ActionDescriptor` and the providers pure preserves every existing
test and the layer boundaries.

## Consequences

- **Gains.** Programmatic, enrollable command population; corpus pollution structurally
  fenced out; one place per surface owns its verbs; inline shortcuts derived from the keymap
  registry so they cannot drift; the palette assembly hook collapses from a 15-hook
  concatenator to a context-build + `resolveCommands` call; every provider is pure and
  unit-tested.
- **Costs / difficulties.** Migrating nine builders to providers and rewiring the assembly
  hook is a real refactor that must preserve the existing palette tests and avoid a
  `stable-selectors` regression in the new context-build. The `CommandContext` must be
  designed to carry everything providers need without becoming a god-object; over-wide
  context is a smell to watch.
- **Pitfalls.** A provider reaching a store directly instead of through the injected context
  re-introduces the impurity the resolver split avoids. A provider emitting a corpus-derived
  standing command re-opens the pollution — the guard test is the backstop. A second
  dispatch path bypassing `appDispatcher` would break the seam invariant.
- **Pathways opened.** A future surface (a new panel, a plugin-style contribution) enrolls
  its commands by registering one provider; the document-search and taxonomy ADRs build
  directly on this registry; a backend-fed ops/rag verb provider (actions ADR) is just
  another registered provider.

## Codification candidates

- **Rule slug:** `palette-commands-come-from-the-one-provider-registry`.
  **Rule:** Every Cmd+K command is contributed by a pure `CommandProvider` registered in
  the one command-provider registry and consumed through the generic host; no surface
  hand-assembles palette commands, and no provider enrolls transient corpus data (a
  per-document / per-feature / per-lens entry) as a standing command — corpus navigation
  lives only in the document-search plane.

  *(Promote only after it holds across one full execution cycle, per the codify discipline.)*
