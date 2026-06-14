---
tags:
  - '#adr'
  - '#dashboard-canvas-controls'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - "[[2026-06-14-dashboard-design-language-adr]]"
  - "[[2026-06-14-dashboard-iconography-adr]]"
  - "[[2026-06-14-dashboard-design-language-research]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
---



# `dashboard-canvas-controls` adr: `node canvas controls` | (**status:** `accepted`)

## Problem Statement

The dashboard is entering a design-driven recodification. Its visual language has been
re-pinned by the base design-language ADR (the convergent agentic-desktop register,
OKLCH token tiers, restraint, keyboard-first density, token-level warmth) and its icon
sources by the iconography ADR (Lucide for structural chrome, Phosphor plus in-family
authored marks for the expressive/domain plane — the four tier marks among the
irreducibly bespoke ones). Those two ADRs fix the base; they do not re-specify the
individual control surfaces, which today still carry the retired paper-warm idiom and
ad-hoc glyphs.

This ADR re-specifies one surface family: the **on-stage node canvas controls** — the
controls that shape *what the canvas shows*, as distinct from the camera/navigation
toolbar that shapes *how the canvas is viewed*. The family is six control groups, each
already shipped and each with a real component under `frontend/src/app/stage/`: the tier
dial (`TierDial.tsx`), the filter bar and its expanded filter sidebar
(`FilterBar.tsx`, `FilterSidebar.tsx`), the working-set breadcrumb trail
(`WorkingSet.tsx`), the layout/algorithm panel (`AlgorithmPanel.tsx`), and node-scoped
discover (`Discover.tsx`). It is spec work: it re-decides the behaviour, states, and
visual treatment of these controls under the new base language and re-affirms the
ownership and contract invariants they must honor. It does not plan or perform the
migration, and it changes no application code on its own authority.

The boundary is deliberate. The camera/zoom navigation toolbar (`NavToolbar.tsx`), the
field rendering itself, and the minimap (`MinimapWidget.tsx`) are separate sibling ADRs
(`dashboard-nav-controls`, `dashboard-node-canvas`, `dashboard-minimap`). This ADR
specifies only the lens, filter, layout, working-set, and discover controls, and refers
the camera, the rendered field, and the minimap to their owners.

## Considerations

The current form is already on stage and largely correct in behaviour; the work is
re-skinning to the base language and tightening a few ownership and honesty seams, not
rebuilding. The grounding facts:

- **The base language to inherit.** The design-language ADR pins dark/light peers via an
  OKLCH semantic token tier remapped under `[data-theme]`, color spent only on a single
  muted accent plus semantic state plus node/edge type, structure felt through soft
  elevation and 1px low-contrast borders, compact-but-breathing density, fast subtle
  state-communicating motion with `prefers-reduced-motion` swapping to instant, tabular
  numerals on data-bearing readouts, and keyboard-first operation. Tokens must be
  readable both as chrome utilities and from the scene via `getComputedStyle`. The
  controls inherit all of this and re-decide nothing about it.

- **The icon language to inherit.** Structural marks on these panels (chevrons, close,
  the sidebar/panel toggles, reset affordances) come from Lucide. The four tier marks
  are bespoke domain marks authored in-family on Phosphor's grid and must pass the 14px
  grayscale-by-shape gate; the discover/semantic mark and any candidate-edge glyph sit on
  the same domain plane. The current components use literal Unicode glyphs for the tier
  marks (`◆ ▣ ◷ ≈` in `TierDial.tsx`), the sidebar toggle (`⊞`), and the discover mark
  (`≈`, `?≈`); under the iconography ADR these resolve to Lucide (chrome) or the
  authored Phosphor-grid tier/semantic marks (domain), not raw code points.

- **The wire contract to honor.** The foundation reference fixes the data these controls
  shape. Filter vocabulary is engine-enumerated via `GET /filters` (relations, tiers,
  doc types, feature tags, node kinds, date bounds, refs) — the filter UI is data-driven,
  nothing hardcoded (§4). Min-confidence is a per-tier float 0..1, engine-validated;
  named presets are a GUI concern compiled to floats client-side (R3). The semantic tier
  is present-only by design, so it is inapplicable in time-travel (§5). Broken structural
  edges are STATE at confidence 0.0, surfaced through the structural-state facet, not the
  confidence floor (§4 broken-edge rule). Every read is bounded by `MAX_GRAPH_NODES` with
  honest `truncated` blocks (§4). Discover is `POST /nodes/{id}/discover` returning ranked
  candidate edges, never auto-asserted, clearly tier-labelled semantic, degrading to the
  tiers block when rag is absent (§4). Every response — success and error — carries the
  per-tier `tiers` degradation block (§2).

- **The current code, audited.** `TierDial.tsx` already implements the four toggles,
  per-tier confidence sliders on temporal/semantic, and the time-travel inapplicable
  state with the correct copy. `FilterBar.tsx` and `FilterSidebar.tsx` read
  `useFiltersVocabulary(scope)` and `useFilterStore`, render facet chips from the
  enumerated vocabulary, surface the hidden-count cost, and treat the date-range chip as
  read-only (timeline-owned). `WorkingSet.tsx` renders the breadcrumb trail with E/
  Backspace/clear and a pure `mergeSlices`. `AlgorithmPanel.tsx` dispatches force/circular
  and FA2 params exclusively through `getScene().controller.command(...)` and never
  touches stores or the wire — the model boundary is already correct there. `Discover.tsx`
  renders quarantined, session-pinned candidates — but it currently fetches directly via
  `useQuery` + `engineClient.discover(...)` inside the app layer, which is a
  layer-ownership seam to correct (see Constraints).

- **The product is an instrument.** These are on-stage controls docked to the work
  surface, not global chrome; they are dimmed relative to the field and lead with the work,
  per the base language's attenuated-chrome law.

## Constraints

The invariants below are inherited, not introduced. The controls are built to honor them
and must not amend them.

- **Layer ownership is one-way.** These controls live in `frontend/src/app/` (app chrome).
  They read graph and vocabulary state only through `frontend/src/stores/` selectors and
  query hooks, and they emit intent only — filter/lens mutations into the view store,
  layout commands into the scene via `SceneController.command(...)`. They MUST NOT
  `fetch` the engine, MUST NOT read the raw `tiers` block directly, and MUST NOT define
  their own node/edge shape. The one current deviation — `Discover.tsx` calling
  `useQuery` + `engineClient` from the app layer — must move behind a stores query/hook so
  the wire client stays the sole wire consumer.

- **Filter vocabulary is engine-enumerated, never hard-coded.** Every facet's legal
  values come from `GET /filters` through the stores vocabulary hook. The lone honest
  exception is the structural-state set (resolved/stale/broken), which is a fixed
  contract enum, not corpus vocabulary; everything else (doc types, feature tags,
  relations, kinds, date bounds) is data-driven and empties to a truthful "none in
  corpus" state when the vocabulary is empty.

- **Layout parameters are scene-only; the engine holds no coordinates.** Force/circular
  mode and the FA2 sliders are render-tuning, dispatched to the scene's layout worker
  through `SceneController` commands and reflected back via `layout-changed` events. They
  never reach the engine, never become a graph query, and never change which nodes the
  engine returns — graph compute is CPU/engine, GPU is render. The panel reads its initial
  truth from `getLayoutState()`, not from any wire response.

- **Discover candidates are quarantined and session-only.** Candidate edges are
  probabilistic suggestions: visually distinct (semantic-haze treatment, a question-mark
  qualifier on the domain mark), rendered on stage only while pinned, and pinned only as
  session client state. They never join the persistent graph, never mint a stable graph
  edge id, and never persist across reload. Suggestions must look like suggestions.

- **Graph reads stay bounded.** Working-set expansion (E on a selection) requests a
  bounded ego/neighbor slice through stores, never an unbounded "expand everything"; the
  union it materializes is the constellation plus explicit expansions, each itself
  bounded. Filtering never asks the engine for a wider set than the contract caps allow,
  and any `truncated` honesty the wire returns is surfaced, not swallowed.

- **The tiers block is read only through stores.** Degradation truth (rag down → semantic
  inapplicable; backend transitions) reaches these controls only as derived stores
  selectors, never by the control parsing a wire envelope. The semantic-inapplicable and
  discover-offline states are designed degraded states, rendered as such, never as errors.

- **Parent stability.** The two parents (design-language and iconography ADRs) are
  `accepted` and the wire contract is binding and shipped; the controls themselves are
  shipped and behaviourally proven. This ADR carries no frontier risk — it re-skins and
  re-seams a working surface against settled parents.

## Implementation

The family is re-specified control-by-control. Each inherits the base tokens (OKLCH
semantic tier, soft elevation, 1px low-contrast borders, consistent radius, attenuated
chrome), the motion grammar (fast subtle transitions; keyboard-initiated changes
instant; `prefers-reduced-motion` → instant), the density register, and the icon sources
(Lucide structural, Phosphor-grid domain marks). All five render the four canonical
states — loading, empty, degraded-per-tiers, and error — as designed states, never as
raw failures.

**Tier dial (`TierDial.tsx`).** The signature trust control and the family's anchor:
four tier toggles in the fixed product order (declared, structural, temporal, semantic),
each carrying its bespoke tier mark authored in-family on the Phosphor grid (replacing
the literal `◆ ▣ ◷ ≈` code points) and passing the 14px grayscale-by-shape gate, with
hue as redundant reinforcement only. Each enabled tier exposes a per-tier confidence
floor as a slider mapped to the engine's float 0..1 grammar ("only what's certain" ↔
"everything you suspect"); the readout uses tabular numerals. Named presets, if added,
compile to floats client-side and never reach the wire. In time-travel mode the semantic
tier renders **inapplicable** — disabled, marked, with the "semantic is about now"
explanation — a designed state, not a gap, because history serves three tiers by design.
The structural confidence floor governs resolved/stale shading only; broken-ness is not
a low confidence and is reached through the status facet, not this slider. States:
loading shows the tiers as skeleton/neutral until the first slice; degraded (rag down)
shows the semantic tier offline; the dial never errors.

**Filter bar and sidebar (`FilterBar.tsx`, `FilterSidebar.tsx`).** One filter model, two
views: the bar is the always-docked quick strip at the stage's top edge (part of the
instrument, dimmed chrome), the sidebar is the full collapsible instrument with grouped
sections and per-value toggles. The tier dial leads the bar; facet chips for doc type,
feature, relation, and text-match draw their legal values from the engine-enumerated
vocabulary hook, with the structural-state set the one fixed-enum facet. Filtered-out is
recoverable context, not deletion: the hidden-count chip names the cost honestly ("N
nodes · M edges hidden") and filter transitions fade/shrink removed elements (per the
motion grammar, instant under reduced-motion) so the user sees *what* a filter removed.
The date-range chip is read-only here; the timeline owns the single date-range filter.
The sidebar toggle and section chevrons are Lucide marks; the sidebar opens as a soft
elevated panel, focuses itself for keyboard traversal, closes on Escape, and offers
"reset all" when any facet is active. States: empty vocabulary renders "none in corpus"
per group; loading renders the strip without chips; degraded surfaces still let
text-match work as a fallback.

**Working-set breadcrumb (`WorkingSet.tsx`).** The materialized-set provenance trail —
the answer to "why is this node on my screen?" It renders the constellation-plus-expansions
union as a chip trail: each expansion is a removable breadcrumb, with a terminal "clear to
constellation" chip. Keyboard E expands the current selection's bounded ego network;
Backspace collapses the last expansion; the clear chip resets to the constellation base.
The union is computed by the pure `mergeSlices` (constellation base plus each bounded
expansion slice, deduped by stable id) and each expansion slice is a bounded ego/neighbor
read through stores — never an unbounded fetch. The trail hides entirely when the working
set is empty (the constellation alone needs no provenance). It reads selection and
working-set state from the view store and emits add/remove/clear intent back; it never
fetches.

**Layout/algorithm panel (`AlgorithmPanel.tsx`).** Pure render-tuning, the cleanest model
boundary in the family. A force/circular mode toggle and FA2 sliders (spread/scalingRatio,
gravity, inertia/slowDown, speed/iterationsPerTick, Barnes-Hut) dispatched exclusively
through `SceneController.command(...)` to the scene's layout worker, with the panel's
initial state read from `getLayoutState()` and kept in sync via `layout-changed` events.
It never fetches, never touches stores, and never reaches the worker directly; the FA2
sliders dim in circular mode where they do not apply. Readouts use tabular numerals; a
"reset" affordance (Lucide-marked) returns the inferred defaults. The panel is a soft
elevated surface that does not compete with the field. This control changes only how the
field is laid out for the eye, never which nodes the engine serves.

**Discover (`Discover.tsx`).** Node-scoped semantic discovery on the selected node,
yielding ranked candidate edges that are visually **quarantined**: listed in the panel
with a confidence score and a question-mark-qualified semantic domain mark, rendered on
stage in the semantic-haze treatment only while pinned, and pinned only as session client
state that never joins the persistent graph. The one required structural change versus the
current code: the discovery fetch moves from the app layer's direct `useQuery` +
`engineClient.discover(...)` into a stores query hook, restoring the single-wire-client
boundary; the panel then consumes that hook and emits pin/unpin/select intent. States:
loading shows an "asking rag…" liveness cue tied to the real in-progress request; empty
shows "no candidates above the floor"; degraded (rag absent) shows the discover-offline
designed state via the tiers truth, never an anonymous error. The panel's violet ad-hoc
palette is replaced by the semantic-tier token and the muted-accent system so candidates
read as the semantic species in any theme.

**Cross-cutting.** Keyboard and a11y are first-class: every toggle is a real
`role="switch"`/`aria-pressed` control with a label, every slider is keyboard-operable
with an `aria-label` and a tabular-numeral readout, the sidebar and layout panels are
`role="dialog"` non-modal surfaces that manage focus and close on Escape, and all motion
respects `prefers-reduced-motion`. Layer ownership holds throughout: app chrome reads
stores selectors and the vocabulary hook, emits filter/lens/working-set intent into the
view store and layout commands into the scene, and (after the discover correction) never
fetches the engine and never reads the raw tiers block. Every control is a dumb view
projecting over the one model.

## Rationale

The controls are already behaviourally sound; the value of this ADR is to fix their
visual and structural definition to the new base before a migration plan touches them, so
the plan re-skins against a pinned target rather than re-deciding per component. Inheriting
the design-language and iconography ADrs wholesale keeps the family consistent with the
rest of the dashboard for free — same tokens, same motion, same two icon sources — and
avoids re-litigating settled decisions. Naming the engine-enumerated vocabulary,
scene-only layout, quarantined discover, bounded reads, and tiers-through-stores
invariants in one place gives the executor a single ownership map for the whole family,
which is exactly the failure-prevention the layer-ownership and projection rules exist for.

Two seams are tightened rather than merely re-skinned because they are cheap to fix now
and corrupting to leave: the literal-glyph tier/semantic marks resolve to the authored
domain marks the iconography ADR mandates, and the discover panel's direct wire fetch
moves behind a stores hook to restore the single-wire-client boundary. Both are
small, both align the family with rules already in force, and both are far cheaper to
specify here than to discover as drift later.

## Consequences

- **Gains.** A single, consistent, theme-correct control family that reads native to the
  agentic-desktop cohort; the tier dial, filters, working set, layout, and discover all
  spend color and motion by the same discipline; the engine-enumerated vocabulary,
  bounded-read, scene-only-layout, and quarantined-discover invariants are documented in
  one ownership map; the discover layer-ownership deviation is closed; the bespoke tier
  marks land on the sanctioned domain plane.
- **Costs and difficulties.** The discover fetch relocation is real work in the stores
  layer plus a consumer rewire, and the discover panel's ad-hoc violet palette must be
  re-expressed in semantic tokens without losing the "this is a suggestion" read. The four
  tier marks must be authored in-family and re-pass the 14px grayscale gate, and the
  literal glyphs scattered across the dial and sidebar toggle must all be swapped to the
  sanctioned sources. Confidence-slider and facet-chip contrast must be re-proven against
  the warm OKLCH ground in every theme.
- **Risks.** The discover relocation could regress the quarantine/session-pin semantics if
  the move is mechanical rather than careful; the bespoke tier marks could fail the
  grayscale gate and need iteration; filter and tier transitions must honor
  reduced-motion without becoming janky. None of these are frontier risks — all sit on
  settled parents and a shipped surface.
- **Pathways opened.** A consistent control family makes a future named-lens / saved-filter
  feature a natural addition over the same model; the documented ownership map makes adding
  a sixth control (or a new facet) a fill-in rather than a re-derivation; the
  tokens-and-marks discipline keeps the family theme-correct as new themes arrive.

## Codification candidates

None. The constraints this ADR re-affirms — layer ownership, engine-enumerated
vocabulary, bounded reads, scene-only layout, tiers-through-stores — are already covered
by active project rules (`dashboard-layer-ownership`,
`views-are-projections-of-one-model`, `graph-queries-are-bounded-by-default`,
`graph-compute-is-cpu-gpu-is-render-and-search`,
`every-wire-response-carries-the-tiers-block`); this ADR applies them to one surface
rather than introducing a new durable constraint.
