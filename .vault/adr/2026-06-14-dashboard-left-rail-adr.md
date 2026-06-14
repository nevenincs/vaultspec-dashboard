---
tags:
  - '#adr'
  - '#dashboard-left-rail'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - "[[2026-06-14-dashboard-left-rail-research]]"
  - "[[2026-06-14-dashboard-sidebar-adr]]"
  - "[[2026-06-14-dashboard-worktree-switcher-adr]]"
  - "[[2026-06-14-dashboard-design-language-adr]]"
---

# `dashboard-left-rail` adr: `left scope rail information architecture` | (**status:** `accepted`)

## Problem Statement

The left scope rail is the dashboard's navigation spine — the standing column that
answers "which project, which worktree, which document am I pointed at" before the
stage renders. Today it composes two accepted surfaces (the worktree switcher and
the read-only vault file browser), and a proposed UI iteration grows it: multiple
project roots above the worktree switcher, a real codebase file tree beside the
vault browser, and an in-rail filter. The danger is that each new surface is
specified in isolation and the rail accretes — surfaces fighting for vertical
space, two competing search affordances, a workspace control that resets scope
differently from a worktree control, a code browser that mints its own node
identity. This ADR is the **information-architecture spine**: it pins the rail's
regions, their order, the collapse model, the single navigation law every surface
obeys, and how the new surfaces (specified in their own sibling ADRs) compose with
the existing ones. It is spec work grounded in `dashboard-left-rail-research`; it
sequences and bounds the rail, re-decides nothing the base language or the sibling
surface ADRs already settled, and authorizes no implementation.

## Considerations

- **The rail is a stack of hosted slots, not a monolith.** The sidebar ADR already
  established the pattern: the rail is chrome that *hosts* independently-specified
  controls (it treats the worktree switcher as a hosted slot and defers its
  internals entirely). This ADR generalizes the pattern to the full rail so each
  surface stays its own ADR and the rail owns only their composition.
- **Navigation is read-only by operator decision.** Every rail interaction is a
  *view-scope* change or a *selection* — choose a workspace, choose a worktree,
  open a document, focus a code file, filter the listing. None mutate git, disk, or
  vault documents. Branch/worktree classification is advisory display; git surfacing
  is status, not control. This is the `engine-read-and-infer` law applied to the
  one surface most tempted to grow "just a checkout button".
- **The base language fixes the look wholesale.** As supporting chrome the rail is
  attenuated (dimmed by default, active surface brightest), compact-but-breathing,
  felt-not-seen depth (soft 1px borders, consistent radius), one muted accent for
  selection, tabular numerals on counts/freshness, monospace on path identity,
  Lucide for structural chrome and Phosphor for domain marks. Nothing here invents a
  new ground, palette, type scale, motion budget, or icon source.
- **Two kinds of "find" must not collide.** The global semantic search pillar
  (`dashboard-search` + `dashboard-rag-search`, `POST /search`) lives in the right
  rail and clicks results through into the graph. The rail's own affordance is a
  *local filter* over the already-fetched listing (vault tree or code tree) — a
  client-side narrowing, not a wire search. They are deliberately distinct surfaces
  with distinct mechanics; conflating them would duplicate the search controller or
  smuggle a fetch into the rail.
- **The command palette is not a rail surface.** `dashboard-command-palette` is a
  lifted `Ctrl/Cmd-K` overlay. The rail may surface a discoverable entry point to
  it, but owns no command logic and no palette state.

## Constraints

- **Layer ownership is absolute.** Every rail surface consumes stores selectors and
  query hooks, emits select/expand/scope intent back through stores actions, and
  never `fetch`es the engine, never defines its own node shape, and never reads the
  raw `tiers` block. Adding a rail facet means adding a stores selector/query and a
  dumb view here — never a rail-local fetch.
- **Selection identity rides the contract's stable node ids.** Vault rows join on
  `doc:<stem>`; code rows join on `code:<path>` (and `code:<path>#<symbol>`); no
  surface mints a private row identity, because the bidirectional selection join
  depends on the shared derivation.
- **Scope swaps are wholesale and stateless.** Choosing a worktree fires the view
  store's `setScope` (the 022 reset). Choosing a *workspace* must reset at least as
  wholesale — it is a coarser swap that also re-points which worktree set is in view
  (specified in `dashboard-workspace-registry`). No surface owns the reset; the
  stores layer does, and the rail control only invokes it.
- **Every read is bounded.** The vault tree is naturally feature-bounded; the code
  tree must be explicitly bounded and lazy (`dashboard-code-tree`). The rail never
  triggers an unbounded read and never descends into the graph itself — descent is
  the stage's bounded concern, reached only by emitting a selection.
- **Parent stability.** The base design-language and iconography ADRs are accepted
  and supply the tokens, motion, density, and icon split inherited wholesale. The
  foundation wire contract (`/map`, `/vault-tree`, stateless scope, the `tiers`
  block) is settled. The `vaultspec-session` orchestration crate (warm multi-scope
  registry, session/settings persistence, the semantic read-and-infer fence) is the
  accepted parent the two new capability ADRs extend; the rail composition assumes
  it, and would block on it only if that crate's session surface were unbuilt.

## Implementation

**The rail as an ordered stack of hosted slots.** The rail remains the leftmost
region: a vertical `aside` pinned to the left edge, full content height above the
bottom timeline, with the slim "Scope" header band and the Lucide collapse chevron
at its leading edge. Expanded it is the current 16rem register; collapsed it is the
~2.5rem spine showing only the expand affordance, with collapse state in
`leftRailCollapsed` (view-store state, persisted per the user-state mechanism). Top
to bottom, the rail hosts, each separated by a soft 1px rule:

1. **Workspace switcher** (new; `dashboard-workspace-registry`) — the coarsest
   scope chooser, choosing which project root is active. Present only when more than
   one root is registered; a single-root workspace renders it as a quiet header, not
   a control, so the common case is not cluttered.
2. **Worktree switcher** (existing; `dashboard-worktree-switcher`) — the
   repository→branch→worktree picker, scoped to the active workspace.
3. **Browser** (the file-thinking surface) — a single region carrying two modes:
   the **vault mode** (existing; `dashboard-sidebar`, the `/vault-tree` projection)
   and the **code mode** (new; `dashboard-code-tree`, the bounded file-tree
   projection). A compact, keyboard-reachable mode toggle switches between them; the
   default mode is vault (the corpus the product is *about*), and the chosen mode is
   view-local state re-keyed per scope so it does not bleed across a swap.
4. **In-rail filter** — an optional filter affordance scoped to the active browser
   mode that narrows the visible listing by name/stem/tag client-side over the
   already-fetched tree. It is explicitly *not* the global search pillar; it issues
   no wire request and clears on scope swap.

**The ordering is the contract made physical.** Scope is chosen coarse-to-fine —
workspace, then worktree, then document/file — mirroring the stateless-scope rule
where every tree read is keyed by the active scope. A workspace swap re-points the
worktree set; a worktree swap re-points the browser; a browser selection re-points
the stage. Each level resets everything below it.

**The single navigation law.** Every rail interaction resolves to one of three
intents emitted through stores actions: *select a scope* (workspace or worktree →
the wholesale reset), *select a node* (a vault doc or code file → focus the stage
node by stable id), or *adjust a local view affordance* (collapse, mode toggle,
filter, group expand — view-local, no wire). The rail issues no mutation intent of
any kind; there is no write path from the rail to git, disk, or the vault.

**Git status, not git control.** The rail surfaces git *state* only: the worktree
switcher's inline ahead/behind/dirty badge (deduplicated through the shared live
status query) and, where the design hosts it, a glanceable changed-count. Working
git review — changed-file lists and read-only diffs — remains the right rail's
`dashboard-git-diff-browser` surface. The rail offers no stage/commit/discard/
checkout/worktree-add affordance; those are categorically outside the read-only
fence.

**States rendered, uniformly.** Every rail surface renders the four honest states
the sibling ADRs already specify — loading (quiet copy-toned pending line, no
spinner theatre), empty (approachable, explains the absence rather than reading as
a fault), degraded (the affected facet renders as designed degraded state with the
reason in copy tone when its `tiers` facet is absent, read only through the stores
hook), and error (a contained, non-alarming, region-scoped failure distinguished
from degradation). The rail never presents a healthy-looking error.

**Keyboard and a11y, rail-wide.** The rail is keyboard-first with a single
top-to-bottom focus order: collapse toggle → workspace switcher → worktree switcher
→ browser mode toggle → filter → the active mode's groups and rows (skipping
collapsed groups). Each hosted control keeps the keyboard contract its own ADR
specifies; this ADR only fixes their order and that the rail is one labelled
navigation landmark. Keyboard-initiated actions are instant; `prefers-reduced-
motion` collapses transitions to immediate changes; selection is conveyed by fill
plus weight, never hue alone.

**Place in the four-layer ownership map.** The rail is app-chrome (the glass): it
consumes stores selectors and query hooks, emits scope/select/affordance intent
through stores actions, never fetches the engine, defines no node shape, and reads
`tiers` only through a stores hook. It projects over the one model — rendering the
`/map`, `/workspaces`, `/vault-tree`, and `/file-tree` projections and joining
selection on the contract's stable ids — and every addition is a stores selector
plus a dumb view, never a new rail-local mechanism.

## Rationale

The decision is a faithful composition of accepted surfaces, not a new design. The
sidebar ADR already proved the hosted-slot pattern and the projection-only rail;
this ADR only generalizes it so the rail can grow a workspace switcher and a code
mode without entangling the existing browser or switcher, exactly the "further
stores-backed dumb views" pathway the sidebar ADR opened. Ordering the rail
coarse-to-fine makes the stateless-scope contract physical and makes each swap's
reset boundary obvious, which is why the worktree-switcher's 022 invariant
generalizes cleanly to a workspace swap. Keeping the rail read-only is the operator
decision and the `engine-read-and-infer` law applied where the temptation to add a
write is strongest; surfacing git state while routing git review to the right rail
keeps that line clean without losing the operator's need to see project status.
Separating the in-rail filter from the global search pillar honors both the
single-wire-client boundary (the filter issues no fetch) and the user's listed need
to narrow the current listing, without duplicating the search controller. The base
language and iconography ADRs make the visuals mechanical, and the research's triage
(F2) is what lets this ADR confidently reference the settled siblings instead of
re-opening them.

## Consequences

- **Gains.** The rail has one coherent, coarse-to-fine navigation model and one
  read-only law every surface obeys, so new facets compose as hosted slots without
  re-litigating identity, fetch ownership, or reset semantics. The workspace switcher
  appears only when it earns its space, keeping the common single-root case
  uncluttered. The vault/code mode toggle gives the file browser room to grow a
  second projection without a second region competing for height. Routing git review
  to the right rail keeps the scope rail about *where am I*, not *what changed*.
- **Costs and difficulties.** The rail's vertical budget is now contested by up to
  four stacked surfaces; the collapse model and the workspace-switcher-as-header
  fallback must be designed so the browser still dominates the rail. The mode toggle
  adds a small piece of per-scope view state that must be wired into the wholesale
  reset, or a stale mode could ride into a new corpus. The in-rail filter must be
  visibly distinct from the global search so operators do not expect semantic results
  from it.
- **Risks.** The standing temptation is a convenience fetch or a private row identity
  "because it is just the file list", or a "checkout this branch" button "because the
  data is right there" — both breach load-bearing invariants the codification
  candidate guards. A new piece of per-scope rail state not wired into `setScope`'s
  reset would silently reintroduce cross-scope bleed; the existing isolation tests
  guard worktree swaps and must be extended to workspace swaps.
- **Pathways opened.** A composed, projection-only rail makes future scope tools
  cheap — a recent-scopes shortlist, a pinned-documents shelf, a second code-tree
  filter lens — each a stores-backed dumb view in a hosted slot. The coarse-to-fine
  ordering is the template for any future scope axis the contract keeps open by
  keeping scope a parameter.

## Codification candidates

- **Rule slug:** `left-rail-is-read-only-navigation`.
  **Rule:** Every left scope rail surface emits only scope-selection, node-selection,
  or view-local-affordance intent through the stores layer; it must never issue a
  `fetch`, mint a node identity, read the raw `tiers` block, or expose any git/disk/
  vault mutation affordance (checkout, commit, stage, discard, worktree/branch
  create or remove) — git is surfaced as read-only status, and working git review is
  the right rail's concern. *(Candidate only; this is a per-surface application of
  `engine-read-and-infer`, `dashboard-layer-ownership`, and `views-are-projections-
  of-one-model`. Promote only if, after one full execution cycle, the rail's
  read-only navigation boundary proves to need its own restatement — otherwise the
  existing rules already bind it.)*
