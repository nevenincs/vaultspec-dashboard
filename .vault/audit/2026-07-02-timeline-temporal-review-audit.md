---
tags:
  - '#audit'
  - '#timeline-temporal-review'
date: '2026-07-02'
modified: '2026-07-02'
related: []
---

# `timeline-temporal-review` audit: `timeline and temporal subsystem architecture review`

## Scope

Standing architecture review of the TIMELINE / TEMPORAL subsystem, backend →
wire → frontend: temporal ingest and correlation-edge identity
(`provenance-stable-keys-are-identity-bearing`), the temporal wire
(`/graph/lineage`, `/graph/asof`, `/graph/diff` incl. the freshly-landed
GIR-010/014/015 bounding), the date-range filter grammar and criterion
threading, the one-writer/many-consumer `date_range` contract
(`one-filter-authority-every-corpus-view-consumes-it`,
`filtering-has-one-canonical-surface`), windowing/reaction behaviour, and
delta-clock/degradation integration. IMPORTANT CONTEXT DISCOVERED DURING THE
REVIEW: the timeline surface was REBUILT under Issue #14 — the scrolling
diachronic view (dots, lanes, axis, playhead, range-drag, minimap,
`scrollStrip`, `RangeSelect`, `Playhead`) was torn down and replaced by a fixed
two-handle date-range selector (`TimelineRangeSelector.tsx`), so several items
in the review brief (pxPerMs/scrollOffset windowing, playhead↔time-travel
arbitration, phase-lane collapse) are audited AGAINST THAT NEW REALITY, and the
residue the teardown left behind is itself the headline finding class. Finding
IDs `TTR-###`; audit-only, no product code changed.

## Findings

### TTR-001 | info | Temporal correlation-edge identity verified sound: the rule never enters the stable key

`Provenance::stable_key` (`engine-model/src/id.rs:126-146`) keys a
`CommitCorrelation` edge as `commit:{sha}` — identity is per (commit, record),
and the correlation RULE stays in provenance as attribution only, exactly per
the W02P07-401 redline the rule (`provenance-stable-keys-are-identity-bearing`)
codified: a rule-2 match upgrading to rule-1 corpus-wide upgrades confidence in
place, never churns edge ids. The correlator (`ingest-git/src/correlate.rs`)
applies strongest-rule-wins per (commit, record) with the four named rules'
confidences descending, and the derivation-label guard tests
(`engine-query/tests/derivation_labeling.rs:351-381`) prove the additive label
never threads into a key either. No defect.

### TTR-002 | info | The temporal wire is bounded, honest, and the GIR-010/014/015 remediation is landed and client-compatible

`/graph/lineage`: default read served from the per-generation `lineage_nodes`
cache as a cheap `bound_range` slice under `MAX_DOCUMENT_NODES` with an honest
truncation block; arcs remain the opt-in overlay; the as-of lineage form rides
the sha-keyed as-of cache and stays bounded. `/graph/asof`: bounded through the
shared slice path. `/graph/diff`: both the document and feature arms now
degrade to keyframe-only above `MAX_DIFF_DELTAS` with the honest
`DiffTruncated` block (GIR-010 + GIR-014, verified in
`engine-graph/src/diff.rs` and the route), and the LIVE commit-broadcast path
now emits the GIR-015 re-keyframe marker on an over-ceiling commit
(`vaultspec-api/src/app.rs:890-934`): a synthetic `op:"rekeyframe"` chunk that
RIDES the seq clock and resume ring, with a regression test
(`app.rs:1353-1427`). Client compatibility verified by construction: the
marker's non-`feature` granularity lands in `graphSync.ts`'s `sawDocumentDelta`
branch → debounced constellation invalidation → full refetch, and a `since=`
resume replays it harmlessly. One cosmetic note: the marker consumes a seq
position the feature-delta clock anchor does not advance past, so the NEXT
feature delta can register a forward "gap" and trigger a second (debounced,
coalesced) invalidation — harmless double-invalidate, not a defect.

### TTR-003 | info | The date-range one-writer contract and criterion threading hold across every consumer

`date_range` writers, exhaustively enumerated (non-test): the
`TimelineRangeSelector` handles/reset (through `useDashboardStateMutations.
setDateRange`), and the palette's timeline commands (last-N-days presets +
clear, `commandPaletteCommands.ts:838-857`) — which are the TIMELINE'S OWN
verbs surfaced on the command plane through the SAME `dateRangePatch` seam,
sanctioned by the one-STATE/authorable-from-eligible-surfaces reading of
`one-filter-authority-every-corpus-view-consumes-it` (the legend/doc_types
precedent). Consumers: the graph query folds the top-level `date_range` into
its filter, the rail narrows by it, and the timeline's own lineage facet
DELIBERATELY excludes it (`dashboardLineageFilterArg`) so the axis is never
double-applied. The criterion (`timeline_date_criterion`:
created/modified/stamped) threads consistently to the engine `date_field`
grammar (`engine-query/src/filter.rs:509-513`), the graph query variables, the
lineage arg, and the rail's client narrow — re-verified unchanged since GS-001.

### TTR-004 | info | The Issue-#14 rebuilt TimelineRange is architecturally exemplary; the brief's windowing and lane items are moot

`TimelineRangeSelector.tsx` is dumb chrome done right: corpus bounds are
BACKEND-SERVED (per-criterion `dateBoundsByField` with a created-span
fallback), degradation is read from the tiers-derived `useTimelineAvailability`
selector (never raw tiers or transport guesses), every write goes through the
canonical mutation seam, a full-span drag CLEARS the filter rather than writing
a full-width range (the undated-documents regression guard, `:141-147`),
double-click resets only the `date_range` facet (never a record clobber),
handle math is a pure unit-tested module (`timelineRangeMath.ts` — one-step-gap
so handles cannot cross, shared by pointer and arrow-key paths), and the
sliders carry real ARIA. The brief's pxPerMs/scrollOffset windowing-math and
phase-lane-collapse items are MOOT: that coordinate model and those lanes were
torn down with the old surface. The previously-logged "range-track selection
marker" follow-up remains a valid, cheap presentation enhancement (draw the
selected node's date as a tick on the track) — the modern descendant of the
GS-003 timeline half.

### TTR-005 | medium | Time travel is now a zombie capability: every ENTRY affordance was torn down with the old timeline, while the full machinery still ships

The Issue-#14 teardown removed the playhead — the only product surface that
ENTERED time-travel — but kept everything downstream: the `timeTravel.ts`
driver + `DeltaLog` scrub machinery, the `/graph/asof` + `/graph/diff` scrub
wire, `asOf` threading through the graph query identity, the `TimeTravelChip`,
and the time-travel HONESTY gating across menus and ops. Exhaustive writer
enumeration shows only EXITS remain reachable: `movePlayhead("live")` from the
chip, the palette's jump-to-live, and the scope-restore path — no reachable
call sets `{kind:"time-travel", at}` from a live surface (see TTR-006 for the
one zombie exception). Shipping exits, gating, and a chip for a mode no user
can enter is the permanently-disabled-lie class `unified-action-plane` forbids.
DECISION NEEDED (either is coherent): (a) restore a deliberate entry
affordance — e.g. a "view corpus at this commit" verb on history/commit rows
(fits the action-plane model, gives /graph/asof+diff a real consumer again); or
(b) retire the client machinery to spec — park the driver/chip/DeltaLog behind
the decision record until a surface returns, keeping the ENGINE wire (it is
correct, bounded, and cheap to keep). What must not persist is the current
middle state.

### TTR-006 | medium | Zombie keymap binding: keyboard navigation still derives playhead intents from the RETIRED scroll-strip coordinate store and can enter time-travel from a chord

`stores/view/keyboardNavigation.ts:174-192` still snapshots the OLD timeline
view model (`timelineViewSnapshot()` → `playheadT`, `pxPerMs`, `scrollOffset`,
`viewportWidth`) to derive keyboard playhead intents, and its action `run` fires
`movePlayhead(intent.playhead, scope)` — writing `{kind:"time-travel"}` into
canonical dashboard state from a keymap binding whose host surface no longer
exists. The chord is still enrolled in the keymap registry (and therefore the
`?` legend), so a user can enter time-travel with an instant computed from a
torn-down surface's stale/empty coordinate store — the worst variant of
TTR-005's middle state. Whichever way TTR-005 is decided, this binding must be
retired (or re-derived against the new range model) — a registry entry bound to
retired state violates both `keyboard-shortcuts-bind-through-the-one-keymap-
registry`'s honesty premise and `unified-action-plane`'s remove-non-capabilities
discipline.

DISPOSITION (2026-07-02, TTR-005 + TTR-006, option (b) chosen — park to spec,
keep the engine wire; option (a) remains a one-word user override): PARK —
`app/timeline/timeTravel.ts` whole (driver, DeltaLog wiring, useTimeTravel,
sceneTarget, mapDelta, the mode predicates — their non-test consumers are only
Stage's `useTimeTravel`; the honesty gating other surfaces use lives in
`stores/server/dashboardState.ts`/`dashboardTimeline.ts` and is KEPT) plus its
test; `scene/deltaLog.ts` + test (sole consumer is the driver);
`stores/server/timeTravelSource.ts` (sole consumer is the driver);
`TimeTravelChip.tsx` + its Stage mount; the keyboardNavigation playhead intent
arms + their keymap registrations (the select-node arm of the same derive is
INDEPENDENT and stays); the orphaned pointer-drag playhead session in
`timelineIntent.ts` (movePlayhead itself stays — it is the exit/healing
writer). KEEP — the entire engine asof/diff wire; the `DashboardTimelineMode`
wire grammar incl. the time-travel variant (backend-persisted states may hold
it; grammar removal breaks healing and option-(a) reversibility); the
stores-side mode helpers and the central time-travel gating (constant-live is
free and keeps the parking reversible); `movePlayhead` +
`patchDashboardTimelineMode` + the write-token seam; the scene seam's `set-time`
member (already a field no-op); `sceneMapping` delta mapping (the LIVE splice
path uses it). RETIREMENT PRECONDITION for the chip/palette exit affordances:
they are NOT inert today — they are the recovery path for a scope whose
backend-PERSISTED `timeline_mode` still says time-travel. `activateWorktreeScope`
(`queries.ts:1434-1441`) already forces live on scope activation; the coder
must verify the COLD-START restore path (`useRestoreSessionScope`) also lands
live before deleting the chip — if it does not, add the same one-line
`movePlayhead("live", …)` healing there FIRST. With that verified, no reachable
user capability is lost: every entry was already dead, and the one functional
writer removed (the zombie chord) produced garbage coordinates.

### TTR-007 | low | Post-teardown orphan: eventSelection.ts has zero production consumers

`app/timeline/eventSelection.ts` (the timeline event → bounded selection/pulse
join) is imported ONLY by `Stage.render.test.tsx` — no production module
consumes it since the marks it served were torn down. Delete it (and its test
usage) or rehome it if the range-track selection marker (TTR-004) wants its
join logic; either way it should not linger as apparent live surface.

### TTR-008 | low | Criterion honesty gap: modified/stamped narrow correctly but the strip's bounds fall back to the created span

The `timeline_date_criterion` setting offers created/modified/stamped and the
criterion is honored as a FILTER end to end (TTR-003). But the strip's own
edges use `dateBoundsByField[criterion]` with a fallback to the flat created
span, and the component notes "Only `created` is served today" — so under
`modified`/`stamped` the readout and handle extents can misrepresent the
corpus span the user is actually narrowing over (a document modified after the
last created date sits outside the drawn track). Two clean fixes: serve
`dateBoundsByField` for all three criteria (the engine's cached
`lineage_nodes` already carry all three dates — this is a cheap projection
addition), or gate the setting's enum to the fields the vocabulary actually
serves (`settings-are-schema-driven`'s no-dead-options spirit). The first is
preferred; it also unlocks surfacing the criterion selector on the strip as
the component comment anticipates.

DISPOSITION (2026-07-02, coder trace — CORRECTED, finding core already
implemented): the "only `created` is served today" statement this finding
leaned on was the COMPONENT'S OWN STALE COMMENT, not the wire's behaviour. The
coder traced the path end to end: `engine-query`'s `filter.rs` `field_bounds`
+ the served vocabulary already emit `date_bounds_by_field` for all THREE
criteria (created/modified/stamped), `liveAdapters` maps it to
`dateBoundsByField`, and the strip's `dateBoundsByField?.[criterion] ??
dateBounds` consumption therefore already draws per-criterion extents — the
misrepresentation scenario does not occur (this likely landed alongside the
criterion-threading work TTR-003 verified). Residual, being fixed: the stale
component comment, plus a guard test pinning per-criterion bounds on the wire
so the comment class cannot silently regress. The "surface a criterion
selector on the strip" idea is a NET-NEW UI enhancement, deferred and flagged
to the user separately — not part of this finding's core. Audit lesson noted:
a component comment is a claim about the wire, not evidence of it; this
finding trusted one where the sibling findings verified the wire directly.

## Recommendations

- Decide TTR-005 (entry affordance vs park-to-spec) BEFORE any further
  timeline work; TTR-006's zombie binding retires in the same change either
  way. If (a), the natural entry verb is "view corpus at this commit" on
  history/commit rows through the shared action-plane builders.
- TTR-008: RESOLVED as already-implemented (see disposition) — residual is the
  stale component comment + a wire guard test; the criterion-selector UI is a
  separate deferred enhancement.
- Delete or rehome `eventSelection.ts` (TTR-007) — a one-line coder task.
- Implement the range-track selection marker (TTR-004 note) as the modern
  GS-003 timeline half — presentation-only, view-local.
- Info ledger for the plan: TTR-001/002/003/004 record the verified-sound
  surfaces (temporal identity, bounded wire + landed GIR remediation,
  one-writer contract, the rebuilt selector) — no work items.
