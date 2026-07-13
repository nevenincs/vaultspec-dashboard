---
tags:
  - '#adr'
  - '#global-context-actions'
date: '2026-06-22'
modified: '2026-07-12'
related:
  - "[[2026-06-22-global-context-actions-research]]"
---

# `global-context-actions` adr: `global context-menu tail and Refresh as a shared state control` | (**status:** `accepted`)

## Problem Statement

The dashboard's context menus are bespoke per kind: each right-clickable element gets
exactly one resolver's verbs, with no mechanism for an action that should appear on
EVERY menu. At the same time the one obviously universal control — Refresh — exists only
as a palette command (`reload:refresh-data`), authored inline, with no chord and no way
to surface it on a right-click. This is the next mini-campaign after the
action-surface-mapping work: decide what is "always exposed for all", whether elements
keep bespoke menus, and where a universal state control like Refresh lives. The grounding
research (`global-context-actions-research`) confirmed there is no global-tail seam today
and that Refresh's light path already exists but is not a shared action.

## Considerations

The answer is a MIX, layered, not a choice between bespoke and global:

- **Bespoke per-kind body** (kept as-is): everything whose payload depends on what the
  element IS — open this doc, relate this node, copy this hash. The resolver registry
  already owns this.
- **A minimal global tail** (new): actions identical regardless of what was clicked,
  appended to every menu under their own trailing divider.
- **A background menu** (mostly deferred): app-chrome escape hatches for right-clicking
  empty space; the graph canvas already has one (`canvasMenu`), the rails/timeline do not.

The decision rule to encode: payload changes with the element → bespoke resolver; payload
identical regardless → global tail; nothing clicked → background menu.

The dominant risk is **tail bloat** — a five-item universal section drowns the two
bespoke verbs that matter — so the always-on tail is capped at essentially one verb:
Refresh. Copy is already kind-specific; settings / palette / shortcuts / reset-layout
belong to a background menu, not stapled to every node, edge, and row.

## Constraints

This ADR depends only on stable, in-tree infrastructure — there is no frontier risk. It
relies on: the resolver registry's single convergence point `resolveActions` (the audit
found no menu bypasses it), the `ActionDescriptor.section` model + `groupContextMenuActions`
divider rendering, the one keymap registry + dispatcher, and the already-proven light
refresh `refreshAllEngineQueries()`. All are mature and shipped. The binding rules
`unified-action-plane` (one descriptor enrolled across planes) and
`keyboard-shortcuts-bind-through-the-one-keymap-registry` (chords through the one
registry) are load-bearing here and constrain the design rather than blocking it. The
heavy rag-reindex ops path is the only adjacent mutating surface, and the design
deliberately keeps it OUT of scope of the tail.

## Implementation

Six decisions, scoped to the global-tail seam + Refresh-as-shared-action; new
rail/timeline background menus are deferred to a follow-up (the canvas menu already
exists).

- **D1 — A new terminal `global` section.** Add `"global"` to `ACTION_SECTION_ORDER`
  after `"danger"`, so the tail always renders last, under its own divider, never
  interleaved with a kind's own verbs.
- **D2 — Registry-side tail seam.** A `registerGlobalTailActions(resolver)` invoked
  inside `resolveActions`: the tail is appended after per-kind resolution and then gated
  by the SAME single time-travel filter (not after it), so per-kind and tail actions are
  filtered uniformly and a `disabledInTimeTravel` tail action cannot leak in historical
  mode. The tail therefore reaches 100% of menus (no bypass exists), receives the same
  `ActionContext` (including `selectedNodeId`), and inherits the gate uniformly. Host-side
  appending in `contextMenu.ts` was rejected as a second composition point that would
  re-thread `timeTravel`/`selectedNodeId` and could drift from the registry gate.
- **D3 — Tail membership: Refresh only.** The always-on tail holds exactly the light
  Refresh. It is kind-agnostic (every element shows it); the seam permits future
  suppression-by-kind but ships with none.
- **D4 — Refresh becomes one shared `ActionDescriptor`.** A single `refreshDataAction()`
  builder keyed on the existing id `reload:refresh-data`, composing
  `refreshAllEngineQueries()`, is enrolled across all planes: the reload palette provider
  (replacing its inline command), a new `reloadKeybindings` `KeybindingDef` + chord, and
  the global tail. The shared id is added to the `actionCoverage` dual-plane guard. Because
  `Mod+R` is browser-reserved (page reload, not reliably preventable), the chord is a safe
  alternative (e.g. `Mod+Shift+R`), rebindable through the engine `keybindings` overrides.
- **D5 — Heavy reload stays a separate ops verb.** `rag reindex` remains the
  confirm-guarded, `disabledInTimeTravel` ops command in the palette/ops surface; it is
  never in the tail, so a per-element right-click is never one mis-click from a full
  reindex.
- **D6 — Refresh uses the blunt proven sweep.** The tail's Refresh calls the existing
  `refreshAllEngineQueries()` (invalidate the map, status, and all ~24 scoped query
  families); a finer targeted invalidation is unnecessary and unproven.

## Rationale

The layered model is the `unified-action-plane` applied to the menu surface: bespoke
verbs stay per-kind (no change), and the one genuinely universal verb is authored ONCE and
composed everywhere, rather than copied into every resolver (which would re-create the
drift the action plane exists to prevent). Attaching the tail at `resolveActions` is chosen
because the research proved it is the single point every menu converges through, so one
seam guarantees universal coverage and uniform time-travel gating — the same
single-convergence discipline the registry already embodies. Capping the tail at Refresh
follows directly from the research's bloat finding (F6); routing Refresh through the one
keymap registry rather than a private handler follows
`keyboard-shortcuts-bind-through-the-one-keymap-registry`. Keeping the heavy reindex out
of the tail preserves the read-and-infer safety the dashboard relies on.

## Consequences

- **Gains.** Every menu gains Refresh with zero per-resolver edits; Refresh becomes
  rebindable and palette-, chord-, and right-click-reachable from one definition; the
  `global` section gives a permanent, uncrowded home for any future truly-universal verb;
  the decision rule (bespoke vs tail vs background) is written down so the next agent
  knows where a new action belongs.
- **Difficulties / pitfalls.** The tail must stay disciplined — the seam makes it trivial
  to add a second, third universal verb, and the bloat the design guards against would
  creep back one "harmless" addition at a time; the `global` section and the one-verb cap
  are the guardrail. The new section touches the shared `ACTION_SECTION_ORDER` and the
  grouping/divider render path, so the menu render tests must be updated. The chord choice
  must avoid the browser-reserved `Mod+R`.
- **Pathways opened.** A background-menu campaign (rail/timeline empty-space menus carrying
  the app-chrome set) is the natural follow-up the deferred F5 scope leaves open; the
  global-tail seam is also the mechanism any future cross-cutting verb (e.g. a universal
  "inspect" or "report issue") would use.

## Codification candidates

- **Rule slug:** `context-menu-actions-are-layered`.
  **Rule:** A context-menu action belongs to exactly one of three layers — a bespoke
  per-kind resolver when its payload depends on what was clicked, the one global tail
  (registry-side, the trailing `global` section) when its payload is identical regardless
  of what was clicked, or a background/empty-space menu when nothing was clicked; the
  always-on global tail stays minimal (Refresh-class universals only), and no surface
  appends universal actions per-resolver.

This candidate is named for a FUTURE codify pass, not promoted now: per the codify
discipline it binds only after it has held across at least one full execution cycle. The
first execution is the audit, not yet the rule.
