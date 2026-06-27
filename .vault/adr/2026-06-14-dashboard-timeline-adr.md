---
tags:
  - '#adr'
  - '#dashboard-timeline'
date: '2026-06-14'
modified: '2026-06-15'
related:
  - "[[2026-06-14-dashboard-design-language-adr]]"
  - "[[2026-06-14-dashboard-iconography-adr]]"
  - "[[2026-06-14-dashboard-design-language-research]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
---

# `dashboard-timeline` adr: `timeline` | (**status:** `deprecated`)

> **Superseded (2026-06-15)** by the relational phase-lane timeline ADR
> (`2026-06-15-dashboard-timeline-adr`) for its *representation* decisions only
> — the fixed commit/document/lifecycle lanes, fit-to-window zoom, and
> non-relational density model are replaced by pipeline-phase lanes, a
> horizontally-scrollable read, and derivation arcs. Every *behavioral
> invariant* stated below (time-travel honesty + ops-disable off the shared
> mode, the single monotonic delta clock, the single date-range writer, layer
> ownership, semantic present-only in history, bounded reads, and the
> animated-transitions motion grammar) is re-affirmed unchanged by the successor
> and remains binding. This document is retained for that invariant record.

## Problem Statement

The dashboard's bottom temporal surface — the timeline — is being re-specified against
the new base UI design language. Today the surface already exists and works: `Timeline`
renders fixed lanes with engine-bucketed density bars resolving to individual marks,
`Playhead` docks LIVE at the right edge and drags off into time-travel mode, `RangeSelect`
writes the single date-range filter and plays the range, `eventSelection` joins event
clicks to stage nodes, and `timeTravel` drives the stage with a keyframe-plus-diff replay
on the shared delta clock. What is missing is not mechanism but register: the surface was
built under the retired paper-warm brand skin with the hand-drawn glyph family, ad-hoc
hue choices (literal `bg-sky-500/10` selection bands, `●`/`✦`/`✧` text glyphs), and a
time-travel "paper ages" tint phrased for the old palette. The base design-language and
iconography ADRs have re-pinned the visual language — OKLCH token tiers, the convergent
agentic-desktop register, Lucide chrome plus Phosphor domain marks, and a formal
animated-transitions motion grammar — so the timeline must be re-stated to inherit that
language exactly, while re-deciding none of the temporal architecture that the foundation
contract already settles.

This ADR is spec work. It pins what the timeline is under the new language and the UX laws
it obeys; it does not plan the migration and it does not change application code. It scopes
strictly to the timeline surface (`frontend/src/app/timeline/`) and the time-travel mode
it owns; the stage, browser, inspector, and rails are out of scope except where the
timeline drives or cross-highlights them through shared state.

## Considerations

The current form is concrete and worth grounding against. `Timeline.tsx` owns the lane
model (`LANES` = commits, documents, lifecycle), zoom-as-aggregation (`bucketForSpan`
selecting `raw`/`1h`/`1d`, density `rect` bars at coarse zoom, individual marks at fine
zoom under the `RAW_MARK_CAP` client ceiling), and the `useTimelineStore` window/playhead
view state. `Playhead.tsx` owns the LIVE-docked playhead, `dragToPlayhead` with its
`LIVE_SNAP_PX` snap-back, `movePlayhead` as the single mutation that drives both the
timeline store and the shared `timelineMode` in `viewStore`, the `TimeTravelChip` docked
on the stage, and the RECONNECTING degraded state read from `useSurfaceStates`.
`RangeSelect.tsx` owns shift-drag range selection writing `setDateRange` on the filter
store (the single date-range writer), and play-the-range via `useRangePlayer` driving the
playhead across the band on animation frames. `eventSelection.ts` owns the event-mark
click that calls `selectEvent` and pulses the joined `node_ids` on the stage. `timeTravel.ts`
owns `TimeTravelDriver` — `scrubTo` with local `DeltaLog` replay when the range is loaded
and a re-keyframe (`graphAsof` + `graphDiff`) on jumps outside it — and `useTimeTravel`
binding `timelineMode` to the scene seam.

The base design language requires several things this surface must now inherit rather than
improvise. Color is spent, not sprinkled: hue is reserved for the single muted accent
(selection, the LIVE/active state), for semantic state, and for node/edge type; the literal
sky-blue range band and hard-coded glyph characters are pre-language artifacts that must be
replaced by semantic tokens and Phosphor marks. Categorical identity (event kinds, lanes)
is carried by shape first with hue as redundant reinforcement, and must stay legible in
grayscale at 14px. Tabular numerals are mandated on the timestamps and counts the ruler and
buckets render. The motion layer pins the animated-transitions grammar the timeline's
diff/replay must obey: add fades in, remove fades out, re-tier is a distinct staged
transition, the same semantic operation always looks the same, object constancy is preserved
by stable ids, ~1s eased timing, `prefers-reduced-motion` swaps to instant, keyboard-initiated
actions never animate, and states that share no structure are cut rather than tweened. The
iconography ADR supplies the marks: event kinds map to Phosphor (git-commit directly,
file-plus / file-text for doc-created / doc-modified, flag-pennant for lifecycle), authored
in-family on the Phosphor grid where bespoke, each re-passing the 14px grayscale gate; chrome
controls (play, return-to-live, clear) draw from Lucide. Both planes consume `currentColor`
and the shared token layer for hue.

The wire contract (foundation reference §5, §7) settles the temporal architecture wholesale
and is re-stated, not re-decided. `GET /events` serves the three heterogeneous event kinds
with engine-side bucketing and the load-bearing `node_ids` join (commit node plus all `doc:`
ids always carried; `code:` ids capped at 20 with `truncated_node_ids`). Time-travel is
keyframe-plus-diff (`GET /graph/asof` + `GET /graph/diff`), with one monotonic delta clock
shared with the live `graph` SSE channel (`last_seq` splices the held keyframe onto the live
stream with no gap or overlap). Historical views serve declared, structural, and temporal
tiers only — semantic is present-only by design — and are blob-true (node lifecycle and
progress at T reconstructed from committed blobs, never the working tree). Graph reads stay
bounded by the node ceiling with honest truncation.

## Constraints

- **Time-travel honesty is enforced and unmistakable.** Dragging the playhead off LIVE
  must put the whole product into an obviously different mode: the stage tint shifts to the
  paper-aged equivalent in the new token vocabulary, a "viewing {date} — return to live"
  chip docks on the stage, and every operational verb disables. The mode lives in the
  shared `timelineMode` so ops-disable and the tint are driven from one truth, never
  per-surface guesswork.

- **Semantic tier is present-only in history.** Historical views render the semantic tier
  as inapplicable — a designed state, not an absence and not an error. The tier dial in
  time-travel shows semantic struck through or dimmed-with-explanation, never as a gap that
  reads as "missing data".

- **One monotonic delta clock.** The scrub replay and the live SSE stream share a single
  sequence. The timeline holds keyframe-plus-diff and replays locally; it must splice onto
  the live stream at the LIVE boundary with no gap or overlap, and re-keyframe on jumps
  outside the loaded range. The timeline must never invent a second clock or animate live
  deltas through its own path — the live feature-delta splice is the stage's single
  production live path.

- **Range-select is the single date-range writer.** The timeline's range selection is the
  only surface in the product that writes the date-range filter. No other view may set it;
  the timeline owns it and reflects it (the filter bar renders it as a chip).

- **Ops disabled in time-travel.** While off LIVE, all mutating operational verbs are
  disabled, driven off the shared mode. Reading and inspecting stay available; writing does
  not.

- **Reads `tiers` only through stores.** The timeline is app-chrome. It consumes events,
  keyframes, diffs, degradation state, and the delta clock through stores hooks and the
  scene seam; it never `fetch`es the engine and never reads the raw `tiers` block. The
  RECONNECTING / degraded surface states arrive pre-derived from the stores degradation
  layer.

- **What it must NOT do.** It must not define its own event or node shape, mint or re-derive
  stable ids (object constancy rides the engine's stable keys), introduce a new model or a
  per-view temporal abstraction, render an unbounded mark count, request an unbounded
  document slice, write any filter other than the date range, re-decide the wire contract, or
  re-introduce literal hex/named-color values or hand-drawn glyphs.

## Implementation

**Scope.** The timeline surface and the time-travel mode it owns:
`frontend/src/app/timeline/Timeline.tsx`, `Playhead.tsx`, `RangeSelect.tsx`,
`timeTravel.ts`, `eventSelection.ts`, and their tests. The behavioral architecture is
inherited intact from the foundation contract and the GUI ADR; this section pins how that
architecture is re-stated under the new design language.

**Lane model.** Exactly the existing ≤4 fixed lanes — commits, document events
(created / modified), and vault lifecycle (steps checked, plans approved, features
archived, audits filed) — kept few and fixed. Heterogeneity is encoded per-event by the
mark, not by adding lanes: each event draws its Phosphor domain mark (git-commit, file-plus /
file-text, flag-pennant for lifecycle) rather than the retired text glyphs, every mark
passing the 14px grayscale-by-shape gate so a lane reads correctly with hue stripped. Lane
labels and the ruler use the UI type scale with tabular numerals on dates and counts. Lane
rules and the ruler baseline use soft low-contrast token borders, not hard rules — structure
felt, not seen. Supporting chrome (lane labels, axis text) is attenuated so the marks lead.

**Zoom-as-aggregation: buckets to marks.** Zoom is aggregation, unchanged in mechanism. The
window span selects the engine bucket granularity; at coarse zoom events render as
per-lane density buckets (histogram bars built from the engine's `counts_by_kind`), and
zooming in past the raw threshold resolves buckets into individual event marks. The engine
owns bucketing; the client keeps a belt-and-suspenders mark ceiling so it never renders an
unbounded mark count even if served one. Density bars use a single muted token fill (no
per-bar hue); individual marks use the Phosphor mark in `currentColor`. The bucket-to-mark
resolution as the user zooms is a structural change of representation, not a tween of the
same elements, so it is a cut between representations rather than an animated morph.

**The LIVE playhead and transport.** The default state is LIVE: the playhead docks at the
right edge, now-anchored and streaming, drawn in the accent / live-state token. The transport
is the playhead grip (drag to scrub), the bracket-step keyboard contract, the range play
control, and the return-to-live affordance. The LIVE indicator carries the degraded-state
truth: when the engine stream is lost it renders RECONNECTING (a designed state from the
degradation matrix, read pre-derived from stores), never an error. A small purposeful
liveness cue on the LIVE indicator is sanctioned (the Codex thinking-state lesson) tied to
the real streaming state, never ambient.

**Entering and exiting time-travel.** Dragging the playhead off LIVE (outside the
right-edge snap zone) enters time-travel mode through the single `movePlayhead` mutation
that writes both the timeline store and the shared `timelineMode`. The mode is unmistakable
and uniform: the stage tint shifts to the paper-aged equivalent expressed in the new token
vocabulary (a warm desaturated shift, within the warmth guardrail — never decoration), the
playhead changes character to the stale / non-live token, a "viewing {date} — return to
live" chip docks on the stage, and all operational verbs disable off the shared mode.
Exiting is one gesture: snapping the playhead back into the right-edge zone, the return-to-live
chip, or the LIVE indicator, each routing through `movePlayhead("live")`, which hands the
stage back to its own live keyframe path. Re-entering and exiting are mode flips, not
inter-state tweens of unrelated content.

**Range selection and play-the-range.** Shift-drag across the surface selects a range and
writes the single date-range filter (the plain drag stays reserved for the playhead). The
committed range renders as a band in the accent token (not a literal sky tint) with a
selection ring matching the base language's selection treatment, and surfaces in the filter
bar as a chip. "Play" animates the playhead across the range so the network grows on the
stage — the cheapest, most legible "history of this feature" story — driven on animation
frames only while a play is active (an idle timeline schedules no per-frame callback).
Clearing the range stops any active play, clears the filter, and returns to LIVE.

**Event-mark click to stage cross-highlight.** Clicking an event mark selects it through the
one shared selection concept (the inspector shows the commit or doc event) and pulses the
corresponding stage nodes via the event's load-bearing `node_ids` join. Because `node_ids` is
bounded (the `code:` cap with a truncation count), the pulse is honest: it highlights what is
carried and the truncation count rides the selection so the inspector states it rather than
silently dropping nodes. Selection is the same shared concept across browser, stage,
timeline, and inspector — the timeline emits select intent, it does not own a private
selection.

**The diff/replay transition grammar.** When the stage animates between temporal states
during a scrub, it obeys the base language's animated-transitions grammar exactly: a node or
edge present at T2 but not T1 fades in; one present at T1 but not T2 fades out; a node that
persists but changes tier or re-links is a distinct staged re-tier transition, not a
fade-swap; the same semantic operation always looks the same; object constancy is preserved
by the engine's stable ids so a persisting node is tweened in place rather than cut and
re-added; transitions run ~1s eased; `prefers-reduced-motion` swaps the whole grammar for
instant state changes; and two states that share no structure (a large jump that
re-keyframes) are cut, not tweened. Layout stays warm across scrub — positions do not reflow
per frame, and appearing nodes fade in at their cached home position. The replay runs on the
shared delta clock with zero per-frame queries; the timeline drives it through the scene
seam, never animating live deltas itself.

**States.** Loading: the surface renders its lane scaffold with a subtle liveness cue while
the first events resolve; it does not flash empty. Empty / no-history: sparse or empty lanes
render as sparse with an approachable empty-state explaining why (the lifecycle lane tracks
the in-flight date-stamping mandate — degrade, don't demand), never as an error. Degraded
per `tiers`: a backend down renders the affected surface in its designed degraded state
(the LIVE indicator becomes RECONNECTING when the stream is lost) read from the stores
degradation layer, never as a failure. Error: a genuine request failure surfaces a legible,
copy-toned message scoped to the timeline; it does not blank the surface or leak across into
the stage. In time-travel the semantic tier is rendered inapplicable — a designed state.

**Keyboard contract, a11y, reduced motion.** Bracket keys step the playhead (one event /
bucket step at a time), arrow keys nudge, and range keys set and clear the range from the
keyboard; keyboard-initiated steps feel instant (they never animate, per the motion law).
The playhead exposes a slider role with a value text naming LIVE or the current ISO instant;
event marks are focusable and activatable with their kind, time, and joined-node count
announced; the range band announces its bounds. `prefers-reduced-motion` removes the scrub
and range-play animation in favor of instant state changes. Marks remain identifiable in
grayscale at 14px so the surface is not hue-dependent.

**Layer ownership and projection over the one model.** The timeline is app-chrome: it
consumes events, the historical keyframe and diff, degradation state, and the shared delta
clock through the stores layer and the scene seam, and it emits time, range, and select
intent back through shared state (`timelineMode`, the date-range filter, the shared
selection). It never `fetch`es the engine and never reads the raw `tiers` block. It is a
projection and consumer over the single model — the temporal projection of the same
`LinkageGraph` the stage renders — not a new model and not a new temporal abstraction layer:
events and historical slices come from existing engine projections surfaced by stores
selectors, and the surface stays a dumb view. All color, density, motion, and marks come from
the shared `:root` token layer and the two sanctioned icon families; nothing is improvised
locally.

## Rationale

The temporal architecture was already settled and proven — the foundation contract pins the
event shape, the keyframe-plus-diff scrub, the one delta clock, the present-only semantic
tier, and blob-true history, and the existing components implement it. Re-deciding any of
that would be churn without payoff and would risk the hard-won invariants (the single clock,
the honest `node_ids` join, the bounded reads). So this ADR deliberately re-states rather
than re-architects: the only thing that genuinely changed is the visual language, and the
base design-language and iconography ADRs already pinned that change. Inheriting those ADRs
wholesale — OKLCH tokens, the convergent register, the Phosphor/Lucide split, the
animated-transitions grammar — gives the timeline a familiar, native feel for the target
audience and retires the pre-language artifacts (literal sky tints, text glyphs, brand-skinned
tint) without touching mechanism.

Keeping time-travel honesty, the single date-range writer, ops-disable, and layer ownership
as hard constraints rather than guidance is what lets the surface stay trustworthy: the
mode-as-shared-state design means the unmistakable tint and the ops-disable are driven from
one truth, and routing all wire access through stores keeps the timeline a dumb projection
over the one model — the same discipline that prevents the per-view fetch-scatter the layer
rules exist to forbid. The motion grammar matters because the diff/replay is the product's
most animation-dense surface; binding it to the established add/remove/re-tier grammar with
object constancy by stable id is what makes "watch the network grow" legible rather than a
flicker.

## Consequences

- **Gains.** The timeline reads native to the agentic-desktop cohort and visually
  consistent with the rest of the dashboard for free, because it draws entirely from the
  shared token layer and the two sanctioned icon families; the pre-language artifacts
  (literal hues, hand-drawn glyphs, brand tint) are retired; the temporal mechanism is
  untouched, so no invariant is put at risk; and the animated-transitions grammar gives the
  scrub a consistent, learnable visual vocabulary shared with every other animated surface.

- **Costs and difficulties.** Each event mark must be re-sourced from Phosphor (or authored
  in-family) and re-pass the 14px grayscale gate; the paper-aged time-travel tint must be
  re-expressed in OKLCH tokens within the warmth guardrail and contrast-proven per theme;
  the diff/replay must be audited against the full motion grammar (object constancy, staged
  re-tier, reduced-motion instant, no-shared-structure cut) rather than the looser prior
  fades. The lifecycle lane's richness still tracks the in-flight date-stamping mandate, so
  some lanes degrade to sparse until that lands — by design, not a defect.

- **Risks.** The warmth guardrail is a discipline: the paper-aged tint must not creep into
  decoration or reduce contrast below the diff-legibility floor. The single-clock and
  single-date-range-writer invariants must be defended in review against any convenience
  shortcut (a private clock for smoothness, a second filter writer). Marks may collide under
  the squint test and need light re-authoring.

- **Pathways opened.** With the timeline projecting over the one model through stores, future
  temporal projections (a per-feature growth view, a richer lifecycle lane as date-stamping
  lands) are additions of a projection plus a selector, not new architecture. The shared
  motion grammar and token layer keep any such addition visually consistent by default.

## Codification candidates

None. This ADR re-states an already-settled temporal architecture under an
already-codified design language; its constraints — time-travel honesty, the single delta
clock, the single date-range writer, layer ownership, and semantic present-only — are each
already captured by existing project rules or the inherited design-language and
iconography ADRs, so no new durable cross-session constraint originates here.
