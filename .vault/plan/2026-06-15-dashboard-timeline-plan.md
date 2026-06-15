---
tags:
  - '#plan'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
tier: L3
related:
  - '[[2026-06-15-dashboard-timeline-adr]]'
  - '[[2026-06-15-dashboard-timeline-research]]'
  - '[[2026-06-12-dashboard-foundation-reference]]'
---

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the
       related: field above.
     - The related: field carries the AUTHORISING documents
       (ADR, research, reference, prior plan) for every Step in
       this plan. Steps inherit this chain; per-row reference
       footers do not exist.
     - NEVER use [[wiki-links]] or markdown links in the
       document body. -->

# `dashboard-timeline` plan

## Wave `W01` - Backend: bounded temporal-lineage projection

Stand up a read-and-infer, enveloped, bounded, blob-true temporal-lineage projection in the engine and its wire route, returning dated nodes together with the edges among them. Wave two depends on this wire shape. Backed by the dashboard-timeline ADR and research, and the foundation reference section five.

### Phase `W01.P01` - Lineage projection in engine-query

Add a bounded temporal-lineage projection that maps doc-type to pipeline phase, collects dated nodes in range with blob-true dates, collects edges among kept nodes from shipped relation/tier edges with graceful derivation-field fallback, bounds the slice under the node ceiling with an honest truncated block, serves semantic present-only, and is covered by unit tests.

- [x] `W01.P01.S01` - Add a deterministic doc-type to pipeline-phase mapping (research/reference to research, adr to adr, plan to plan, exec to exec, audit to review, rule to codify); `engine/crates/engine-query/src/pipeline.rs`.
- [x] `W01.P01.S02` - Collect the dated document nodes in the requested range with blob-true creation dates from the git object DB; `engine/crates/engine-query/src/lineage.rs`.
- [x] `W01.P01.S03` - Collect edges among the kept nodes from the shipped relation and tier edges with a graceful fallback when the derivation field is absent; `engine/crates/engine-query/src/lineage.rs`.
- [x] `W01.P01.S04` - Bound the slice under the document node ceiling and emit an honest truncated block, serving declared, structural, and temporal tiers with semantic present-only; `engine/crates/engine-query/src/lineage.rs`.
- [x] `W01.P01.S05` - Add a unit test asserting the node-ceiling bound and the truncated block on an over-ceiling query; `engine/crates/engine-query/src/lineage.rs`.
- [x] `W01.P01.S06` - Add a unit test asserting self-consistency: the returned edge set contains only edges among the returned nodes; `engine/crates/engine-query/src/lineage.rs`.
- [x] `W01.P01.S07` - Add a unit test asserting the doc-type to phase-lane mapping for each pipeline phase; `engine/crates/engine-query/src/pipeline.rs`.
- [x] `W01.P01.S08` - Register the lineage projection module in the engine-query crate root; `engine/crates/engine-query/src/lib.rs`.

### Phase `W01.P02` - Wire route in vaultspec-api

Expose the projection as a wire route taking scope, from, to, and filter params, built through the shared envelope helper so the tiers block rides success and error, register the route, amend the contract reference section five with the chosen wire shape, and cover it with route tests.

- [x] `W01.P02.S09` - Add the lineage route handler taking scope, from, to, and filter params and calling the projection; `engine/crates/vaultspec-api/src/routes/temporal.rs`.
- [x] `W01.P02.S10` - Build the lineage response through the shared envelope helper so the tiers block rides the success envelope; `engine/crates/vaultspec-api/src/routes/temporal.rs`.
- [x] `W01.P02.S11` - Build the lineage error response through the shared envelope helper so the tiers block rides the error envelope; `engine/crates/vaultspec-api/src/routes/temporal.rs`.
- [x] `W01.P02.S12` - Register the lineage route in the routes module; `engine/crates/vaultspec-api/src/routes/mod.rs`.
- [x] `W01.P02.S13` - Amend the contract reference section five with the chosen lineage wire shape; `.vault/reference/2026-06-12-dashboard-foundation-reference.md`.
- [x] `W01.P02.S14` - Add a route test asserting the tiers block rides the lineage success envelope; `engine/crates/vaultspec-api/src/routes/temporal.rs`.
- [x] `W01.P02.S15` - Add a route test asserting the tiers block rides the lineage error envelope; `engine/crates/vaultspec-api/src/routes/temporal.rs`.

## Wave `W02` - Stores layer: sole wire client, mock mirrors live

Add the wire types, tolerant adapter, lineage query hook, and a mockEngine double that mirrors the live wire shape exactly, plus the timeline view state. Depends on Wave one's wire shape; Wave three's representation consumes this hook. Backed by the dashboard-timeline ADR and research.

### Phase `W02.P03` - Wire types and tolerant adapter

Add the LineageSlice, LineageNode, and LineageArc wire types and a client method in the engine module, with a tolerant liveAdapters adapter that reconciles the lineage shape.

- [x] `W02.P03.S16` - Add the LineageSlice wire type carrying nodes, arcs, tiers, and truncated; `frontend/src/stores/server/engine.ts`.
- [x] `W02.P03.S17` - Add the LineageNode wire type carrying stable id, doc-type, derived phase, blob-true dates, title, and degree; `frontend/src/stores/server/engine.ts`.
- [x] `W02.P03.S18` - Add the LineageArc wire type carrying stable id, src, dst, relation, derivation, tier, and confidence; `frontend/src/stores/server/engine.ts`.
- [x] `W02.P03.S19` - Add the client method that fetches the lineage slice for a scope, range, and filter; `frontend/src/stores/server/engine.ts`.
- [x] `W02.P03.S20` - Add a tolerant liveAdapters adapter that reconciles the lineage slice shape; `frontend/src/stores/server/liveAdapters.ts`.
- [x] `W02.P03.S21` - Add an adapter unit test covering the lineage slice reconciliation; `frontend/src/stores/server/liveAdapters.test.ts`.

### Phase `W02.P04` - Lineage hook, mock, view state

Add the useTimelineLineage hook, make mockEngine serve the exact wire shape, prove mock-mirrors-live with a consumer test feeding a captured live-shaped sample through the adapter, and extend the timeline store view state.

- [x] `W02.P04.S22` - Add the useTimelineLineage hook wrapping the lineage projection for scope, range, and filter; `frontend/src/stores/server/queries.ts`.
- [x] `W02.P04.S23` - Make mockEngine serve the exact lineage wire shape with derivation-fallback edges; `frontend/src/testing/mockEngine.ts`.
- [x] `W02.P04.S24` - Add a consumer test feeding a captured live-shaped lineage sample through the adapter and asserting the reconciled result; `frontend/src/stores/server/queries.test.ts`.
- [x] `W02.P04.S25` - Extend useTimelineStore with scroll offset and pixels-per-time scale view state; `frontend/src/app/timeline/Timeline.tsx`.
- [x] `W02.P04.S26` - Extend useTimelineStore with per-lane visibility view state; `frontend/src/app/timeline/Timeline.tsx`.
- [x] `W02.P04.S27` - Extend useTimelineStore with hovered-node view state; `frontend/src/app/timeline/Timeline.tsx`.

## Wave `W03` - Representation: phase-lane arc diagram

Rebuild the rendering as a scroll-strip phase-lane arc diagram with dated marks, derivation arcs, and bundling, while retaining and adapting the existing transport components. Depends on the stores hook from Wave two; Wave four drives this representation. Backed by the dashboard-timeline ADR and research.

### Phase `W03.P05` - Scroll-strip and phase-lane model

Add the scroll-strip model (pixels-per-time scale and offset, LIVE-docked-right, scroll-left-walks-back, virtualization, belt-and-suspenders cap) and the phase-lane model with doc-type-to-lane mapping, as pure tested helpers.

- [x] `W03.P05.S28` - Add the scroll-strip scale and offset model (pixels-per-time, LIVE-docked-right, scroll-left-walks-back) as a pure helper; `frontend/src/app/timeline/scrollStrip.ts`.
- [x] `W03.P05.S29` - Add visible-range virtualization with a margin so marks and arcs stay bounded at any corpus age; `frontend/src/app/timeline/scrollStrip.ts`.
- [x] `W03.P05.S30` - Add the belt-and-suspenders client mark and arc cap; `frontend/src/app/timeline/scrollStrip.ts`.
- [x] `W03.P05.S31` - Add unit tests for the scroll-strip scale, offset, virtualization, and cap helpers; `frontend/src/app/timeline/scrollStrip.test.ts`.
- [x] `W03.P05.S32` - Add the phase-lane model with the doc-type to lane mapping as a pure helper; `frontend/src/app/timeline/phaseLanes.ts`.
- [x] `W03.P05.S33` - Add unit tests for the phase-lane model and doc-type to lane mapping; `frontend/src/app/timeline/phaseLanes.test.ts`.

### Phase `W03.P06` - Dated marks and derivation arcs

Render dated document marks (Phosphor, 14px grayscale gate, tabular numerals), derivation arcs reusing the tier-as-treatment vocabulary, raw-arcs-under-cap for v1 with HEB bundling plus disparity filter plus un-bundle-on-hover as an explicit hardening step, and ego-highlight plus dim-the-rest on hover.

- [x] `W03.P06.S34` - Render dated document marks with their Phosphor domain mark and tabular-numeral dates; `frontend/src/app/timeline/Timeline.tsx`.
- [x] `W03.P06.S35` - Add the 14px grayscale-by-shape gate assertion for the phase-lane document marks; `frontend/src/app/timeline/Timeline.render.test.tsx`.
- [x] `W03.P06.S36` - Render derivation arcs reusing the tier-as-treatment edge vocabulary; `frontend/src/app/timeline/arcs.ts`.
- [x] `W03.P06.S37` - Render raw arcs under the client cap for v1; `frontend/src/app/timeline/arcs.ts`.
- [x] `W03.P06.S38` - Add HEB bundling along feature/lineage containment with a disparity filter as a hardening step; `frontend/src/app/timeline/arcs.ts`.
- [x] `W03.P06.S39` - Un-bundle the hovered node's arcs as the bundling-legibility affordance; `frontend/src/app/timeline/arcs.ts`.
- [x] `W03.P06.S40` - Add ego-highlight plus dim-the-rest on node hover; `frontend/src/app/timeline/Timeline.tsx`.
- [x] `W03.P06.S41` - Add tests for arc treatment, bundling, un-bundle-on-hover, and ego-highlight; `frontend/src/app/timeline/arcs.test.ts`.

### Phase `W03.P07` - Retain and adapt the transport

Retain and adapt the existing transport to the new model: the playhead, the single date-range-writer range-select, the one-clock time-travel driver, and the shared-selection event selection, each adapted in its own step.

- [x] `W03.P07.S42` - Retain and adapt the Playhead to the scroll-strip model; `frontend/src/app/timeline/Playhead.tsx`.
- [x] `W03.P07.S43` - Retain and adapt the RangeSelect as the single date-range writer over the scroll-strip model; `frontend/src/app/timeline/RangeSelect.tsx`.
- [x] `W03.P07.S44` - Retain and adapt the time-travel driver on the one delta clock with keyframe plus diff; `frontend/src/app/timeline/timeTravel.ts`.
- [x] `W03.P07.S45` - Retain and adapt event selection through the shared selection with a bounded node_ids pulse; `frontend/src/app/timeline/eventSelection.ts`.

## Wave `W04` - Control surfaces, states, accessibility, motion

Build the control bar, honest states, accessibility contract, and motion grammar over the rebuilt representation. Depends on Wave three; Wave five integrates the result. Backed by the dashboard-timeline ADR and research.

### Phase `W04.P08` - Control bar

Build the control bar: phase-lane toggles, relation/derivation filter chips sourced from the engine filters enumeration, the reused tier dial, the feature filter, the zoom and fit and jump and minimap-scrubber controls, and the range-select chip with play-the-range, each its own step where self-similar.

- [x] `W04.P08.S46` - Add the phase-lane show/hide toggles to the control bar; `frontend/src/app/timeline/TimelineControls.tsx`.
- [x] `W04.P08.S47` - Add relation/derivation filter chips sourced from the engine filters enumeration; `frontend/src/app/timeline/TimelineControls.tsx`.
- [x] `W04.P08.S48` - Reuse the tier dial in the control bar with semantic inapplicable in time-travel; `frontend/src/app/timeline/TimelineControls.tsx`.
- [x] `W04.P08.S49` - Add the feature filter to the control bar; `frontend/src/app/timeline/TimelineControls.tsx`.
- [x] `W04.P08.S50` - Add the zoom in/out control; `frontend/src/app/timeline/TimelineControls.tsx`.
- [x] `W04.P08.S51` - Add the fit-all control; `frontend/src/app/timeline/TimelineControls.tsx`.
- [x] `W04.P08.S52` - Add the fit-feature control; `frontend/src/app/timeline/TimelineControls.tsx`.
- [x] `W04.P08.S53` - Add the jump-to-date control; `frontend/src/app/timeline/TimelineControls.tsx`.
- [x] `W04.P08.S54` - Add the minimap-as-scrubber overview ribbon; `frontend/src/app/timeline/Minimap.tsx`.
- [x] `W04.P08.S55` - Add the range-select chip with play-the-range to the control bar; `frontend/src/app/timeline/TimelineControls.tsx`.
- [x] `W04.P08.S56` - Add tests for the control bar toggles, chips, tier dial, and fit/zoom/jump controls; `frontend/src/app/timeline/TimelineControls.test.tsx`.

### Phase `W04.P09` - States, time-travel honesty, a11y, motion

Add honest states (loading scaffold, empty, degraded-from-tiers, contained error), re-affirm time-travel mode off the shared timelineMode, build the accessibility contract (slider role, focusable marks and arcs with announcements, switch roles), and make prefers-reduced-motion instant.

- [x] `W04.P09.S57` - Render the loading lane scaffold with a subtle liveness cue, never a flash of empty; `frontend/src/app/timeline/Timeline.tsx`.
- [x] `W04.P09.S58` - Render the empty/no-history sparse state with an approachable explanation; `frontend/src/app/timeline/Timeline.tsx`.
- [x] `W04.P09.S59` - Render the degraded-from-tiers state read pre-derived from the stores degradation layer; `frontend/src/app/timeline/Timeline.tsx`.
- [x] `W04.P09.S60` - Render a contained, copy-toned, retry-able error scoped to the timeline; `frontend/src/app/timeline/Timeline.tsx`.
- [x] `W04.P09.S61` - Re-affirm time-travel mode (warm tint, return-to-live chip, ops-disable) off the shared timelineMode; `frontend/src/app/timeline/timeTravel.ts`.
- [x] `W04.P09.S62` - Add the playhead slider role naming LIVE or the current ISO instant; `frontend/src/app/timeline/Playhead.tsx`.
- [x] `W04.P09.S63` - Make marks focusable, announcing kind, date, joined-node count, and lineage degree; `frontend/src/app/timeline/Timeline.tsx`.
- [x] `W04.P09.S64` - Make arcs reachable from their endpoints, announcing the relation and endpoints; `frontend/src/app/timeline/arcs.ts`.
- [x] `W04.P09.S65` - Give the lane toggles and filter chips switch roles; `frontend/src/app/timeline/TimelineControls.tsx`.
- [x] `W04.P09.S66` - Swap scrub, range-play, and bundle animation for instant state changes under prefers-reduced-motion; `frontend/src/app/timeline/Timeline.tsx`.
- [x] `W04.P09.S67` - Add tests for the honest states, the a11y roles and announcements, and reduced-motion instant behavior; `frontend/src/app/timeline/Timeline.render.test.tsx`.

## Wave `W05` - Integration, review, verification

Wire the timeline into the AppShell, run the full lint gate, and close with code review and verification. Depends on all prior Waves. Backed by the dashboard-timeline ADR and research.

### Phase `W05.P10` - Integration and lint gate

Wire the timeline into the AppShell layout, add render and integration tests, and run the full lint gate to exit 0.

- [x] `W05.P10.S68` - Wire the rebuilt Timeline into the AppShell layout; `frontend/src/app/AppShell.tsx`.
- [x] `W05.P10.S69` - Add render and integration tests for the Timeline mounted in the AppShell; `frontend/src/app/timeline/Timeline.render.test.tsx`.
- [x] `W05.P10.S70` - Run the full lint gate to exit 0; `frontend/src/app/timeline/Timeline.tsx`.

### Phase `W05.P11` - Review and verification

Run the code-review audit, perform visual and manual in-browser verification, and run the codify check.

- [x] `W05.P11.S71` - Run the code-review audit over the timeline build; `.vault/audit/2026-06-15-dashboard-timeline-audit.md`.
- [x] `W05.P11.S72` - Perform visual and manual in-browser verification of the timeline surface; `frontend/src/app/timeline/Timeline.tsx`.
- [x] `W05.P11.S73` - Run the codify check for durable cross-session lessons; `.vault/audit/2026-06-15-dashboard-timeline-audit.md`.

## Description

This plan implements the relational phase-lane timeline specified in the
`dashboard-timeline` ADR. The surface today is a non-relational density re-skin
(three fixed lanes, fit-to-window zoom, no edges); the ADR supersedes only that
representation while re-affirming every behavioral invariant (one delta clock,
single date-range writer, time-travel honesty, bounded reads, stable-key
identity, layer ownership).

The work is sequenced across five Waves. Wave one stands up the backend: a new
bounded temporal-lineage projection in `engine-query` that, for a scope and
date range, returns the dated nodes together with the edges among them, built
through the shared envelope helper so the `tiers` block rides every response,
bounded by the document node ceiling with an honest `truncated` block, and
graceful when the additive `derivation` field is absent (falling back to the
shipped `relation`/tier edges). Wave two adds the stores layer: wire types, a
tolerant adapter, the `useTimelineLineage` hook, and a `mockEngine` double that
mirrors the live wire shape exactly, proven by feeding a captured live-shaped
sample through the adapter. Wave three rebuilds the representation: the
scroll-strip model, dated marks, derivation arcs reusing the tier-as-treatment
vocabulary, HEB bundling with disparity filtering as an explicit hardening step,
and the retained transport (playhead, range-select, time-travel driver, event
selection) adapted to the new model. Wave four builds the control surfaces,
honest states, accessibility, and motion contract. Wave five integrates the
surface into the AppShell, runs the full lint gate, and closes with code review
and verification.

The `derivation` edge field is the one real dependency and it is not yet
shipped; the projection degrades gracefully so the timeline draws real lineage
from day one and gains richer labels when the field lands. The build does not
block on the node-semantics campaign.

## Steps







## Parallelization

The five Waves are sequenced: `W01` -> `W02` -> `W03` -> `W04` -> `W05`. Each
Wave must land before the next begins, because the stores layer consumes the
backend wire shape, the representation consumes the stores hook, the control
surfaces drive the representation, and integration assembles all of it.

Within `W01`, the lineage projection (`P01`) must land before the wire route
(`P02`), which serves it. Within `W02`, the wire types and adapter (`P03`) must
land before the hook, mock, and view state (`P04`), which depend on those types.
Within `W03`, the scroll-strip and lane model (`P05`) must land before the marks
and arcs (`P06`), which position against the scale; `P07` retains and adapts the
existing transport components (playhead, range-select, time-travel, event
selection) and shares no hard dependency on `P06`, so `P07` may overlap `P06`
once `P05` is in place. Within `W04`, the control bar (`P08`) and the states and
accessibility pass (`P09`) touch overlapping surfaces and are best run in
sequence by a single owner, but carry no hard inter-Phase dependency. Within
`W05`, integration and the lint gate (`P10`) precede the review and verification
Phase (`P11`).

## Verification

The plan is complete when every Step is closed (`- [x]`) and the following
criteria hold:

- The lineage projection is bounded: a query that would exceed the document node
  ceiling returns the capped subgraph plus an honest `truncated` block; unit
  tests assert the bound.
- The projection is self-consistent: the returned edge set contains only edges
  whose src and dst are both in the returned node set; a unit test asserts no
  dangling edge ships.
- The phase mapping is deterministic: a unit test asserts each doc-type maps to
  its single pipeline-phase lane (research/reference -> research, adr -> adr,
  plan -> plan, exec -> exec, audit -> review, rule -> codify).
- Every wire response carries the `tiers` block on success and error, built
  through the shared envelope helper; a route test asserts the block rides both
  envelopes. The contract reference section five names the chosen wire shape.
- The mock mirrors the live wire shape: a consumer test feeds a captured
  live-shaped sample through the tolerant adapter and asserts the reconciled
  result, proving the mock and live origin serve the same shape.
- Arcs render with the tier-as-treatment vocabulary and bundle at coarse scale,
  un-bundling the hovered node's ego; legibility of the un-bundle affordance is
  verified.
- The transport invariants are intact: one delta clock, a single date-range
  writer, and time-travel honesty (warm tint, return-to-live chip, ops disabled
  off the shared `timelineMode`); tests assert each.
- The full lint gate `just dev lint all` exits 0 (eslint + prettier + tsc and
  Rust fmt + clippy).
- The code-review audit returns PASS, and a11y (slider role, focusable marks and
  arcs with announcements, switch roles) plus `prefers-reduced-motion` instant
  behavior are verified in-browser.
