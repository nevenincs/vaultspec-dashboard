---
tags:
  - '#adr'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
related:
  - "[[2026-06-15-dashboard-timeline-research]]"
  - "[[2026-06-14-dashboard-timeline-adr]]"
  - "[[2026-06-14-graph-representation-adr]]"
  - "[[2026-06-14-graph-node-semantics-adr]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
---



# `dashboard-timeline` adr: `relational phase-lane timeline` | (**status:** `accepted`)

## Problem Statement

The dashboard's bottom temporal surface is being built out from a non-relational
density timeline into a relational view of the vault corpus. The surface today
(re-skinned under the accepted timeline ADR) renders three fixed lanes
(commits / documents / lifecycle), fit-to-window zoom, and engine density buckets
that resolve to individual marks — but it draws no relationships. It shows *when*
documents entered the corpus and nothing about *how they connect*. The recent
design-adoption and rail campaigns re-built the left, right, and centre surfaces
but left the timeline as the prior re-skin.

The product owner wants the timeline to become the corpus's diachronic lineage
view: a horizontally-scrollable left-to-right read where each vault document
(research, ADR, plan, execution record, audit, rule) and commit appears at its
date, and the relationships between them — a plan's authorizing ADR, its
generated execution records, a feature's `related:` links — are drawn so that the
**temporal overview and the relational lineage are both legible at once**. The
confirmed representation idiom is a **phase-lane arc diagram**: lanes are the
framework pipeline phases, dated document marks sit in their phase lane, and
derivation arcs flow left-to-right across the lanes.

This ADR is the complete build spec for that feature: the representation, the
backend projection that feeds it, the frontend state, the control surfaces, the
states, and the accessibility and motion contract. It supersedes the
*representation* decisions of the prior timeline ADR (fixed lanes, fit-to-window
zoom, no relationality) while inheriting that ADR's behavioral invariants
intact. It scopes to the timeline surface (`frontend/src/app/timeline/`), the
time-travel mode it owns, one new bounded `engine-query` projection plus its wire
route, and the stores selectors that feed the surface. The stage, browser,
inspector, and rails are out of scope except where the timeline cross-highlights
them through shared state.

## Considerations

**The lineage already exists in the model; the timeline projects it, it does not
invent it.** The engine's `LinkageGraph` holds typed `Edge`s over four provenance
tiers (declared / structural / temporal / semantic), and the node-semantics ADR
introduces an additive `derivation` edge field carrying the framework
relationship — `grounds` (research/reference → ADR), `authorizes`/`binds`
(ADR → plan), `generated-by` (plan → exec, with the `W##/P##/S##` container
path), `aggregates` (exec → summary), `reviews` (plan/exec → audit),
`promoted-from` (audit → rule) — plus the feature-membership star. This *is* the
research → ADR → plan → execution → audit → rule chain the phase-lane arcs must
draw. The timeline is therefore a new temporal projection over the one model
(views-are-projections-of-one-model), not a new model and not a per-view
abstraction.

**The backend has the join but not the relation on the wire.** `GET /events`
serves dated events with a per-event `node_ids[]` join to graph nodes, but no
endpoint returns, for a scope and range, the dated nodes *together with the edges
among them*. Drawing arcs needs that pairing. Two paths were weighed
(research F3): compose `/events` + `/graph/query` client-side, or stand up a
dedicated bounded lineage projection. The dedicated projection is chosen: it
keeps the read bounded and honest behind the shared envelope, keeps the timeline
a dumb single-selector consumer, and isolates the lineage shape behind one
mock-mirrors-live selector instead of scattering a two-call join across the
chrome.

**Reusable machinery exists for every hard part.** Tier-as-treatment edge styling
(`frontend/src/scene/field/edgeMeshes.ts`: declared solid / structural
status-hued / temporal dotted / semantic haze) gives arcs the same vocabulary the
stage uses. Hierarchical edge bundling along containment + disparity filtering,
DOI-gated and un-bundled on hover, is already the settled discipline of the
graph-representation ADR and is what keeps a multi-month arc field from becoming a
hairball. Ego-highlight + dim-the-rest (node-canvas ADR) is the hover model.
Control bars reuse the stage `FilterBar` facet-chip pattern and the `TierDial`
shape-first switch pattern, with vocabulary sourced from the engine `/filters`
enumeration, never hardcoded.

**The visual language is fixed and inherited.** OKLCH semantic tokens (no literal
hex, scene-read tokens as literal hex per theme), warmth-in-tokens, Lucide chrome
+ Phosphor domain marks each passing the 14px grayscale-by-shape gate, tabular
numerals on all dates and counts, and the animated-transitions motion grammar.
None of this is re-decided here; it is consumed.

## Constraints

- **Supersession is scoped to representation; invariants are inherited.** This ADR
  deprecates the prior timeline ADR's fixed-lane / fit-to-window / non-relational
  *representation* only. Every behavioral invariant of that ADR and the
  foundation contract is re-affirmed unchanged: time-travel honesty with
  ops-disable driven off the shared `timelineMode`; one monotonic delta clock
  shared with the live SSE channel; the timeline as the single date-range writer;
  layer ownership (reads via stores only, never the raw `tiers` block, never a
  `fetch`); semantic tier present-only in history; the motion grammar.

- **All reads are bounded and honest.** The lineage projection serves a bounded
  node/edge slice under the document node ceiling, returns only edges among kept
  nodes (self-consistent), and states any truncation in a `truncated` block — it
  never serializes an unbounded full-corpus slice. The client keeps a
  belt-and-suspenders mark/arc ceiling. Descent into a denser view is scoped (by
  feature filter or date range), never "return everything"
  (graph-queries-are-bounded-by-default).

- **The projection is read-and-infer behind the shared envelope.** The new route
  reads the graph and serves a projection; it writes nothing, mints no new
  semantics, and is constructed through the shared envelope helper so it carries
  the per-tier `tiers` block on success and error
  (engine-read-and-infer, every-wire-response-carries-the-tiers-block).

- **Arc identity rides engine stable keys.** Arcs key off the engine's stable edge
  ids; object constancy across scrub and live update is preserved by those ids,
  never by a client-minted key. A change to any stable-key composition is a
  contract event, not a refactor (provenance-stable-keys-are-identity-bearing).

- **Degradation is read from tiers, semantic is present-only in history.** The
  surface's degraded states (RECONNECTING, lifecycle-sparse, empty) are read
  pre-derived from the stores degradation layer, never guessed from a transport
  error (degradation-is-read-from-tiers-not-guessed-from-errors). In time-travel
  the semantic tier renders inapplicable — a designed state, not a gap.

- **Parent-feature stability.** The `derivation` edge field is specified by the
  node-semantics ADR but is *not yet shipped* in the engine (that campaign's plan
  is at 0% execution). This is the one real dependency. Mitigation: the
  projection degrades gracefully — when `derivation` is absent it falls back to
  the shipped `relation`/tier edges already in the graph (declared `related:`
  links, structural mentions, the plan `Contains` hierarchy), so the timeline
  draws *real* lineage from day one and gains the richer derivation labels when
  that field lands. The build does not block on the node-semantics campaign.

## Implementation

**Supersession.** The prior timeline ADR is marked deprecated for its
representation decisions (its Status section names this ADR as successor); its
invariants live on here. The existing components (`Timeline.tsx`, `Playhead.tsx`,
`RangeSelect.tsx`, `timeTravel.ts`, `eventSelection.ts`) are evolved in place,
not discarded — the playhead, range-select, time-travel driver, and event
selection are retained; the lane model, zoom model, and rendering are rebuilt.

**Backend — a bounded temporal-lineage projection.** A new `engine-query`
projection and wire route serve, for `scope + from/to + filter`, the dated
document nodes in range together with the edges among them. Each node carries its
stable id, doc-type, derived pipeline phase, blob-true date(s), title, and
salience inputs (degree); each edge carries its stable id, src/dst, `relation`,
`derivation` (when present), `tier`, and `confidence`. The response is built
through the shared envelope helper (carries `tiers`), is bounded by the document
node ceiling with an honest `truncated` block, returns only edges among kept
nodes, and serves declared + structural + temporal tiers with semantic
present-only. Phase is derived from doc-type by a single deterministic mapping
(research/reference → research; adr → adr; plan → plan; exec → exec; audit →
review; rule → codify). The exact wire shape (stand-alone `/graph/lineage` vs.
an extension of `/events`) is settled in the plan against the existing route
module; the contract reference §5 is amended with the chosen shape. Time-travel
of the lineage reuses the existing keyframe-plus-diff temporal endpoints; v1 does
not add an as-of form of the lineage projection (see Consequences).

**Frontend state — one selector, local view state, shared cross-surface state.**
A `useTimelineLineage(scope, range, filter)` stores hook wraps the projection and
returns nodes + arcs + `tiers` + `truncated`; `mockEngine` serves the exact wire
shape and a consumer test feeds a captured live sample through the tolerant
`liveAdapters` adapter (mock-mirrors-live-wire-shape). Until the projection
lands, the hook composes `/events` + `/graph/query` behind the same signature so
view code is written once. The surface's own view state (scroll offset,
pixels-per-time scale, per-lane visibility, hovered node) extends
`useTimelineStore`. Shared state is unchanged: the playhead writes `timelineMode`;
selection flows through the one shared `Selection` concept and
`bindSelectionToScene`; the date range is written only here; degradation is read
from `useSurfaceStates().timeline`.

**Representation — phase lanes, dated marks, derivation arcs.** Lanes are the
pipeline phases (research/reference · adr · plan · exec · review · codify), few
and fixed, with commits as an ambient base rule (off by default, toggle-on),
so the lineage leads. Each document is a node at its blob-true creation instant in
its phase lane, drawn with its Phosphor domain mark (shape-first, 14px grayscale
gate); modification shows as a faint trailing tick; node weight rides degree
(salience, kept simple for v1). A relation is an arc between two marks; because
lanes are phase-ordered and x is time, the derivation chain reads as arcs flowing
left-to-right and down (research → adr → plan → exec) then up to review and
codify. Arc treatment reuses the tier-as-treatment vocabulary; the `derivation`
relation labels the arc on hover.

**Density, bundling, and the scroll model.** The fit-to-window `TimeWindow` is
replaced by a scroll-strip: a zoomable pixels-per-time scale and a scroll offset,
with marks and arcs virtualized to the visible range plus a margin so the surface
stays bounded at any corpus age. The playhead docks LIVE at the right (the
present); scrolling left walks back in time. An overview/minimap ribbon gives
whole-corpus orientation and doubles as a scrubber. At coarse scale, arcs bundle
hierarchically along feature/lineage containment with disparity filtering (the
graph-representation discipline) so cross-feature links read as clean threads,
DOI-gated, and un-bundle on hover; marks collapse to per-lane count glyphs at the
coarsest scale (the retained zoom-as-aggregation idea). The bucket↔mark and
bundle↔un-bundle changes are structural changes of representation — cuts between
representations, not animated morphs.

**Interaction.** Hovering a node lifts its 1-hop lineage ego (node + neighbors +
incident arcs keep full treatment and labels) and dims the rest; it does not
hide. Clicking a node selects it through the one shared selection concept (the
inspector shows the document; the stage pulses the joined nodes via the bounded
`node_ids` join, with any truncation count carried so it is stated, not silently
dropped). Shift-drag selects a date range and writes the single date-range filter
(rendered as a clearable chip; plain drag stays the playhead). A feature filter
collapses the arcs to one feature's lineage thread ("history of this feature").
Play-the-range animates the playhead across the band so the stage network grows.

**Control surfaces (the bars).** A control bar composes: phase-lane show/hide
toggles; relation/derivation filter chips (grounds / authorizes / generated-by /
aggregates / reviews / promoted-from / feature-star, sourced from the engine
enumeration); the reused tier dial (declared/structural/temporal/semantic, with
semantic inapplicable in time-travel); a feature filter; zoom / fit-all /
fit-feature / jump-to-date controls with the minimap as scrubber; and the
range-select chip with play-the-range. All chrome draws from the `:root` token
layer and the two icon families; tabular numerals on every date and count;
non-color active cues; every control keyboard-reachable.

**Time-travel mode (inherited, re-affirmed).** Dragging the playhead off LIVE
(outside the right-edge snap zone) enters time-travel through the single
`movePlayhead`/`setTimelineMode` mutation that writes the timeline store and the
shared `timelineMode`. The mode is unmistakable: the stage tint shifts to the
warm desaturated time-travel token (within the warmth guardrail), the playhead
takes the stale token, a "viewing {date} — return to live" chip docks on the
stage, and all operational verbs disable off the shared mode. The stage diff/
replay runs on the one delta clock through the scene seam, obeying the
animated-transitions grammar (add fades in / remove fades out / re-tier staged /
object constancy by stable id / ~1s eased / reduced-motion instant /
no-shared-structure cut). Exiting is one gesture routing through
`movePlayhead("live")`.

**States.** Loading renders the lane scaffold with a subtle liveness cue, never a
flash of empty. Empty/no-history renders sparse with an approachable explanation
(the lifecycle/derivation richness tracks the in-flight date-stamping and
node-semantics mandates — degrade, don't demand). Degraded-per-`tiers` renders
the designed degraded state (LIVE → RECONNECTING on stream loss) read from
stores. A genuine request failure surfaces a contained, copy-toned, retry-able
message scoped to the timeline, never blanking the surface or leaking into the
stage. In time-travel the semantic tier renders inapplicable.

**Accessibility & motion.** The playhead exposes a slider role naming LIVE or the
current ISO instant; nodes are focusable, announcing kind/date/joined-node count
and lineage degree; arcs are reachable from their endpoints with the relation and
endpoints announced; the range band announces its bounds; lane toggles and filter
chips are switches. Bracket keys step the playhead, arrows nudge, range keys set
and clear; keyboard-initiated steps are instant (never animate).
`prefers-reduced-motion` swaps scrub/range-play/bundle animation for instant
state changes. Every mark and arc treatment is identifiable in grayscale at 14px.

**Layer ownership.** The timeline stays app-chrome: it consumes the lineage
slice, the historical keyframe/diff, degradation state, and the delta clock
through stores and the scene seam, and emits time / range / select intent back
through shared state. It never `fetch`es the engine, never reads the raw `tiers`
block, defines no node/edge shape of its own, and re-mints no stable ids.

## Rationale

The phase-lane arc diagram was chosen over the alternatives (pure arc ribbon,
document-lifespan Gantt, incremental on-demand connectors) because it answers the
owner's question — "which document when, and how connected" — most directly while
giving the left-to-right read an inherent vertical structure: the pipeline-phase
lanes make the *shape* of a feature's progress legible at a glance, and the
x-axis-as-time plus phase-ordered lanes make the derivation chain read as a
natural left-to-right-and-down thread rather than an undirected tangle (research
F4). It also maps cleanly onto an engine concept already specified (the
`derivation` edge field), so the arcs draw a real, named lineage rather than an
invented one.

A dedicated bounded projection was chosen over a client-side two-call join
because it keeps the timeline a dumb single-selector consumer, keeps the read
bounded and honest behind the shared envelope, and isolates the lineage wire
shape behind one mock-mirrors-live selector — the same discipline that prevents
the per-view fetch-scatter the layer rules forbid. Reusing the settled
HEB-bundling + disparity-filter discipline and the tier-as-treatment edge
vocabulary, rather than inventing timeline-local versions, keeps the relational
view visually consistent with the stage for free and inherits the hairball
defense that campaign already proved.

Superseding only the representation while inheriting every behavioral invariant
keeps the hard-won temporal guarantees (one delta clock, single date-range
writer, time-travel honesty, bounded reads, stable-key identity) intact — the
build is a representation change, not a re-architecture of the temporal spine.

## Consequences

- **Gains.** The timeline becomes the corpus's lineage view: the pipeline shape
  and the cross-document relationships are visible in one left-to-right read,
  scrollable across the whole corpus. It draws real lineage from shipped edges on
  day one and enriches automatically when the `derivation` field lands. It reads
  native to the rest of the dashboard because it draws from the shared token
  layer, the two icon families, the tier-as-treatment vocabulary, and the
  bundling discipline. The temporal spine is untouched, so no invariant is at
  risk.

- **Costs and difficulties.** A new bounded projection plus wire route is real
  engine work (read-and-infer, enveloped, bounded, blob-true), and the contract
  reference §5 must be amended. The scroll/virtualization model replaces the
  fit-to-window model and must stay bounded and smooth at corpus scale. Arc
  bundling/disparity is non-trivial; v1 may ship raw arcs under a cap with
  bundling as a hardening pass (settled in the plan). Each phase-lane mark and
  arc treatment must re-pass the 14px grayscale gate.

- **Risks.** The `derivation` field dependency is mitigated by the fallback to
  shipped edges, but the arc *labels* are richer once it lands; the build must not
  hard-depend on it. The bounded-read and single-date-range-writer invariants
  must be defended in review against convenience shortcuts. The HEB bundling can
  obscure individual arcs if the un-bundle-on-hover affordance is weak — it must
  be tested for legibility. Time-travel of the lineage itself (animated arc
  growth) is explicitly deferred: v1 keeps the playhead + stage diff as the
  animated path and shows the lineage for the current range statically; an as-of
  lineage form is a fast-follow, called out so it is a known boundary, not a
  silent gap.

- **Pathways opened.** With the lineage as a bounded projection over the one
  model through stores, future temporal projections (a per-feature growth view,
  an as-of lineage with animated arc growth, a richer salience model) are each an
  addition of a projection plus a selector, not new architecture, and stay
  visually consistent by default.

## Codification candidates

None. This ADR composes existing, already-codified disciplines — projection over
the one model, bounded-and-enveloped reads, tier-as-treatment, the motion
grammar, layer ownership, stable-key identity — onto a new surface; it introduces
no new durable cross-session constraint not already captured by an existing rule.
The supersession of the prior timeline ADR is a normal ADR lifecycle event, not a
rule.
