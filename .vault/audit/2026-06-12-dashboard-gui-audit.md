---
tags:
  - '#audit'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-06-15'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
  - "[[2026-06-12-dashboard-gui-adr]]"
  - "[[2026-06-12-dashboard-foundation-adr]]"
---

# `dashboard-gui` audit: `W01.P01 review`

## Scope

Rolling per-phase review log for the dashboard-gui plan execution
(author-reviews-executor separation: plan authored by experience-architect,
executed by gui-executor, reviewed by experience-architect). Each phase
boundary appends one review section; phase checkboxes close only after the
phase's findings are resolved or explicitly accepted.

## Findings

### Review W01.P01 (renderer gate closure) - 2026-06-12

Reviewed: steps S01-S04, commits `c07f841`, `621eb61`, `4a7aac4`, `60320fc`,
`4fe6eeb`, summary commit; step records and phase summary under
`.vault/exec/2026-06-12-dashboard-gui/`. Verified independently: typecheck
clean, vitest 15/15 green, no React import under `frontend/src/scene/`,
plan checkboxes match shipped work, step records exist for all four steps,
ADR row G6.b carries the verdict with the open condition stated rather than
absorbed. **Phase verdict: PASS with one open condition and three low
advisories. W01.P03 may start.**

The S04 RL-5c seam additions are REVIEWED AND ACCEPTED as shaped: `expand`
event (distinct from `open`, matching the ADR section 3.2 expand-ego
grammar), `pin` event with `pinned` boolean, and the `set-pinned`
ReadonlySet command. The round-trip respects unidirectional flow (event out,
view store persists per G5.d, membership command back in) and is consistent
with the `set-visibility` membership form. The seam lock stands; further
surface changes remain ADR-flagged redlines.

## gate-igpu-001 | medium | G6.b verdict confirmed while the literal integrated-GPU run remains open

The gate criterion reads "on integrated GPUs"; the recorded numbers (10k/50k
settled-animating 59.3 fps, continuous-layout 36 fps, 1k/5k vsync-locked)
were measured on a discrete RTX 4080 SUPER and are an upper bound. The
condition is honestly flagged in the step record, the ADR row, and to
team-lead with repro steps - correctly not absorbed.

**CLOSED 2026-06-12 - WAIVED by human decision** (relayed by team-lead;
recorded in the decisions ADR G6.b flag): no iGPU hardware exists in this
environment and the application's target hardware baseline is a dedicated
GPU, consistent with the rag sibling's CUDA assumption. Discrete-GPU numbers
stand as the gate evidence; the iGPU run is best-effort and non-gating; the
parameterized spike harness stays committed in case adopter feedback reopens
the question. W01 wave closure is not blocked on this finding. The plan's
Verification criterion was amended to match.

## delta-remove-shape-002 | low | SceneDelta remove payload underspecified at the seam

`SceneDelta` carries optional full `node`/`edge` entities; for `op: "remove"`
an id-only payload suffices and requiring the full entity would make the
mock and engine paths carry dead weight. The seam comment defers replay to
W01.P02 S06 (`frontend/src/scene/deltaLog.ts`), which is the right place to
resolve it - but resolve it deliberately there (id-only remove variant or
documented full-entity requirement), not implicitly, and keep whichever
shape the contract's `/graph/diff` entries settle on.

## spike-tier-wrap-003 | low | tier modulo wrap must not migrate into the production field

`partitionEdgesByTier` in `frontend/spike/edgeMesh.ts` maps out-of-range
tier indices by `% tierCount`, silently mis-bucketing malformed input.
Acceptable in the spike harness; the production edge renderer (W01.P03 S11,
`frontend/src/scene/field/edgeMeshes.ts`) must instead treat an unknown tier
as a data error surfaced truthfully, per the product's
truthfulness-over-polish stance.

## verdict-edit-discipline-004 | low | renderer verdict was hand-recorded into an accepted ADR

Commit `60320fc` edits the accepted foundation ADR body to record the G6.b
verdict. The edit itself is correct, in-scope (the row explicitly awaited
the spike outcome), and well-written; logging it only so the precedent stays
narrow: status updates to flagged rows are fine, decision rewrites would
need a superseding ADR.

## Recommendations

- Schedule the integrated-GPU gate run (gate-igpu-001) before any W01
  closure review; report numbers into the ADR row alongside the discrete
  baseline.
- W01.P02 S06 resolves the delta remove shape (delta-remove-shape-002) in
  step-record prose so the mock engine (W02.P05 S19) inherits one canonical
  shape.
- W01.P03 S11 includes an unknown-tier guard test (spike-tier-wrap-003).

## Codification candidates (W01.P01 review)

None of the four findings meets the durability bar yet: gate-igpu-001 is a
one-shot verification task, 002/003 are single-site implementation choices,
and 004 documents an acceptable precedent rather than a constraint. If the
seam-lock discipline (surface changes to a locked seam are ADR-flagged
redlines, never drive-by edits) holds through one more execution cycle, it
becomes a codification candidate at the W01 closure review.

### Review W01.P02 + W01.P03 (scene data and delta engine; Pixi field) - 2026-06-12

Reviewed: steps S05-S13, step records and phase summaries; review conducted
by experience-architect with a read-only reviewer agent sweep, gates re-run
independently (typecheck pass, eslint pass on `frontend/src/scene/`, vitest
115 tests green). Seam verified: no React import under `frontend/src/scene/`;
SceneController surface unchanged except two flagged-and-accepted additions
(optional `title` on `SceneNodeData`, accepted as an RL-2 omission repair;
optional `meta` field, see 008 below). Prior findings closed properly:
delta-remove-shape-002 (remove deltas carry the full entity, id the only
load-bearing field, code and record match) and spike-tier-wrap-003
(`UnknownTierError` surfaced from `setEdges`, guard tests honest, no modulo
wrap). Confidence encoding is lightness-based and grayscale-safe per G7.d.
**Phase verdicts: W01.P02 PASS with findings; W01.P03 PASS with findings.
Both safe to build on; 005 must be fixed before S34 consumes the delta log.**

## replay-clock-conflation-005 | medium | delta replay cursor mixes the t and seq clocks

`frontend/src/scene/deltaLog.ts` orders, dedupes, and gap-detects on `seq`
(correct per the contract's single-clock guarantee) but `replayTo(t)`
advances its cursor by comparing each delta's `t` field. The contract
guarantees `seq` monotonicity, never that `t` is monotonic with `seq`; equal
or non-monotonic timestamps within a monotonic-seq batch are legal and can
stop the cursor mid-batch in a state no engine response ever asserted. All
current replay tests use strictly increasing distinct `t` values, so the
case is untested. Fix before W02.P08 S34 builds the time-travel driver on
this code path: either drive the cursor by `seq` and treat `t` as a label,
or document and test an explicit t-monotonic-with-seq invariant sourced from
the contract.

## fa2-init-collision-006 | medium | worker init lacks the duplicate-edge guard applyChanges has

`frontend/src/scene/field/fa2.worker.ts` guards duplicate edge ids in
`applyChanges` but not in the `init` keyframe path; a duplicate id in the
initial slice throws an uncaught `UsageGraphError` on the worker thread and
silently kills layout (no positions ever post back). A malformed slice
should degrade to a surfaced error, not a dead worker - the same
truthfulness stance S11 applied via `UnknownTierError`. Mirror the guard or
catch-and-post a diagnostic in `init`.

## freshness-ambient-clock-007 | low | applyVisibility reads Date.now() on a frame path

`frontend/src/scene/field/nodeSprites.ts` threads an injected `now` through
`sync` but reads `Date.now()` inside `applyVisibility`, making the freshness
channel non-deterministic through that method. Thread `now` in for
consistency; the pure helper is already tested.

## meta-edge-preshipped-008 | low | meta-edge treatment shipped ahead of its authorizing step

The optional `meta` field on the seam and the `"meta"` edge group treatment
(declared base mixed toward paper, log2 thickness) land in S05/S11 ahead of
their consumer (W02.P06 S21 constellation aggregation) and without an
authorizing step row; correctly flagged in the S05 record. Accepted as
contract-aligned (§4 meta-edges) and additive, with the explicit caveat that
the encoding is NOT locked: S21 verifies it against actual aggregation needs
and may revise it, recording the outcome in its step record.

### Review W01.P04 + W02.P05 (DOM islands; contract mock fixtures) - 2026-06-12

Reviewed: steps S14-S20, step records, P04 summary (wave-close rollup) and
P05 summary; reviewer-agent sweep with gates re-run independently
(typecheck, eslint, prettier clean; vitest 115 green; production build
verified mock-free - the env-flag guard dead-code-eliminates and the mock is
reachable only via dynamic import). Hybrid overlay (G6.a) verified
end-to-end: change-only anchor dispatch keeps per-frame state out of React,
islands are plain projection-positioned React, and the S16
GlyphTextureProvider abstraction genuinely isolates the commissioned-family
swap to a texture source. EngineClient covers every contract family with
(scope, filter, as-of) cache keys; stateless scope enforced. Note: the P04
and P05 summaries under-report test counts (written before later commits);
informational only. **Phase verdicts: W01.P04 PASS. W02.P05
PASS-with-findings and a REQUIRED mock revision: findings 009 and 010 must
be fixed before W02.P08 begins - the mock fences all of W02, and these two
poison the time-travel surface it fences.**

## mock-asof-omits-feature-nodes-009 | high | historical slices never contain feature nodes

`frontend/src/testing/mockEngine.ts` builds the delta timeline by adding a
node only when it is the first entry of an event's node id list, but feature
nodes always ride at later positions; verified empirically, `sliceAsOf(now)`
returns all document and commit species and zero feature nodes, while the
live constellation query returns only feature nodes plus meta-edges. The two
views are species-disjoint: scrubbing from the constellation would make the
entire default node species vanish. Contract §5 frames asof as a full
keyframe of the same graph, blob-true at T. Fix in the mock before any
W02.P08 step lands: emit feature nodes into the delta timeline so asof and
diff slices carry the constellation species.

## diff-splice-lossy-ts-010 | high | diff resume window keyed on timestamp loses seq siblings

The mock's diff endpoint windows on strict timestamp comparison while the
delta clock is seq-monotonic; the fixture timeline has 72 timestamp
collision groups (up to 3 deltas per ts), so resuming from a collision
member silently drops its seq siblings. The SSE path honors since-seq
correctly; the HTTP diff path reintroduces exactly the LIVE-boundary race
the contract's splice guarantee closes. The existing midpoint test passes by
luck of landing on the later collision member. Fix with 009: re-key the diff
window on seq (or guarantee unique per-delta timestamps) and add a
collision-spanning splice test.

## degraded-tier-still-served-011 | medium | degradation block flips but tier content keeps flowing

Tier degradation blocks are present on every response (verified across all
twelve client families), but the mock never withholds the degraded tier's
edges: the constellation query serves its semantic meta-edges even while the
block reports semantic unavailable. A consumer can simultaneously read
"semantic unavailable" and receive semantic edges - a self-contradiction the
W03 degradation matrix (G8.a) would be coded against. Gate tier content on
the degradation state in the same mock revision.

## asof-wallclock-historical-012 | medium | historical classification depends on the machine clock

`sliceAsOf` classifies "historical" by comparing against wall-clock now
minus one second inside an otherwise deterministic seeded mock; with the
2026-01 corpus every query is historical, and a live-edge asof would behave
machine-dependently. Compare against the corpus's own max event timestamp
instead. Ride the same revision; not independently blocking.

## anchor-sweep-unwired-013 | low | anchor driver full-sweeps per frame and has no production caller yet

`frontend/src/scene/field/anchors.ts` epsilon-gates dispatch correctly but
its update does an O(tracked) projection sweep per camera or layout frame,
and no production code invokes the driver yet (field assembly is deferred to
W02.P06 S21). Negligible at island counts; the S21 review confirms the
driver is wired to both camera and layout ticks and revisits the sweep cost
only if tracked counts grow.

**CLOSED at the W02.P06 review:** `fieldAssembly.ts` invokes the driver on
both the layout-positions and camera-change callbacks with a production
caller from the assembled stage. Sweep-cost note stands as
revisit-if-counts-grow.

### Review W02.P06 (stage interactions) - 2026-06-12

Reviewed: steps S21-S27 at boundary commit `33b0218`, step records and
summary; reviewer-agent sweep with gates re-run (typecheck, eslint clean;
vitest 140 on the live tree, 132 at the boundary commit - the delta is
uncommitted P07 work, counts honest at the boundary; production build green
with the FA2 worker chunk emitted and reachable from app entry - the
foundation rider is closed). Seam discipline verified: React-free scene,
hover ego-highlight gated scene-side on pointermove with only discrete
events crossing the seam, working-set re-keyframes on state change not per
frame. Design fidelity to the ADR section 3.2 confirmed point-by-point:
details-first constellation, recede-not-hide ego lift, one shared selection
with a tested no-bounce-back guard, in-place lifecycle-axis and plan-tier
interiors, E/Backspace working set, quarantined session-only discover with
truthful rag-down state, layout-fixed always-labelled persisted pins with
corrupt-blob self-heal. Seam additions `SceneEdgeData.meta` and optional
`SceneFieldRenderer.command` accepted: optional, additive, contract-aligned,
flagged-and-justified per the locked-seam discipline (the optional command
keeps the sigma fallback swap honest). Carried-forward dispositions: 013
CLOSED (above); 008 implementation half closed (encoding contract-aligned,
GUI never client-flattens), recording half stays open as 014.
**Phase verdict: PASS with findings; no revision required to merge.**

## meta-edge-outcome-not-recorded-014 | low | S21 record omits the 008 verification outcome sentence

The S21 step record describes the ribbon treatment but never states the
explicit outcome finding 008 required (verified against real aggregation
needs; kept or revised). The substantive check passes in code; append one
sentence to the S21 record affirming the encoding was verified against the
mock's meta-edges and kept unchanged. That sentence formally retires 008.
Due before the W02 wave-close review.

## summary-counts-drift-015 | low | phase records read stale against a drifted working tree

P06 records claim 132 tests; the live tree holds 140 because uncommitted
P07 work has begun. Counts are honest at the boundary commit. Process note,
no action: phase gates are read at boundary commits; executors should keep
summaries stamped with their commit hash (S27/summary already do).

## discover-dangling-edge-016 | low | pinned candidate with unmaterialized target is held but undrawn

Self-flagged in the S26 record: a pinned discovery edge whose target is not
on stage is surfaced by the model but not drawn until expansion materializes
the target. Quarantine semantics preserved (session-only, haze-treated,
never persisted). Accepted as a v1 refinement; revisit if discover usage
shows users losing pinned candidates.

## edge-fade-snaps-017 | low | edge visibility snaps on membership while nodes fade

Self-flagged in S21: membership changes rebuild edge topology and snap
rather than fade, while nodes animate per G3.f. The animated-filter intent
lands fully with W02.P07; this finding transfers there - the P07 review
checks edge transitions explicitly.

**CLOSED with the P05 mock-revision commit `6bd6519`:** edge visibility now
fades through transition mesh groups in the same 200ms band as nodes.

### Mock-revision re-check (P05/P02/P03 fix set, commit 6bd6519) - 2026-06-12

Verified against code and tests: 009 feature nodes and meta-edges enter the
delta timeline (historical-slice test); 010 diff windows re-keyed on seq
with a collision-spanning splice test over a real fixture group; 005 replay
cursor is pure seq arithmetic, t resolves once to a target index including
its whole ts-collision group, backward scrub rebuilds from the keyframe; 011
degradation gates tier content; 012 historical classification on the corpus
clock; 006 fa2 init duplicate-edge guard with surfaced diagnostic; 007
injected freshness clock; direction field stripped per amended contract
section 4. Gates: typecheck and 153/153 vitest green. **Findings 005, 006,
007, 009, 010, 011, 012, 017 CLOSED. The S21 record sentence landed,
retiring 008 and closing 014. The W02.P08 gate is open.**

### Review W02.P07 (filter system) - 2026-06-12

Reviewed: steps S28-S31 at boundary commit `f13e2f8` plus the fix-set
commit, conducted directly by experience-architect (reviewer-agent capacity
unavailable); gates re-run (typecheck, 153 vitest green). Verified: one
filter model with two compilations sharing one source of truth (wire filter
per R3; RL-5a visibility membership with hidden counts derived from the
actual membership diff); vocabulary 100% engine-enumerated via the filters
query, no hardcoded values found; tier dial renders semantic as a designed
inapplicable state in time-travel (G4.b), distinct from rag-down; hidden-
cost chip present; meta-edge ribbons survive when any constituent tier is
on (documented choice, consistent with 008's accepted encoding).
**Broken-edge ruling (W02P05-201) compliance VERIFIED structurally:** the
model types confidence floors for temporal and semantic only - a structural
floor is inexpressible, so no slider state can hide a broken edge; the
builtin broken-links lens selects on the state facet; fixtures carry
confidence 0.0 on broken edges with guard tests.
**Phase verdict: PASS with findings.**

## lens-scope-key-018 | medium | lenses persist under a global key, not workspace+scope

`frontend/src/stores/view/lenses.ts` stores saved lenses under the literal
key `vaultspec-dashboard:lenses:default`, while G5.d (and the pins
implementation it mirrors) keys client persistence by workspace and scope.
Lens choices embed scope-dependent vocabulary (feature tags, doc types from
the engine enumeration), so a lens saved in one workspace can reference
vocabulary meaningless in another. Either key the storage by workspace+scope
(pins already demonstrate the pattern) or record the workspace-global choice
as a deliberate deviation with rationale in the S31 record. Resolve before
the W02 wave-close review.

## broken-lens-isolation-019 | low | builtin broken-links lens shows broken edges amid everything else

The builtin lens sets the structural-state facet to broken but leaves all
four tiers on, so the view is "everything, with structural edges filtered to
broken" rather than "the broken-links view." The ADR's intent ("show me
everything broken") suggests isolation: structural tier only plus the broken
state facet, all nodes retained. Either isolate the builtin or record the
inclusive reading as deliberate.

### Review W02.P08 (timeline) + W02 wave-close - 2026-06-13

Reviewed: steps S32-S36 at boundary commit `736134d`, reviewer-agent sweep
plus a direct visual pass (boundary commit served from a temp worktree with
the mock engine; the app boots, all four regions render, constellation and
timeline live - two visual observations sent to the executor: LIVE playhead
position vs rail extent, and bucket-mark magnitude encoding). Gates re-run:
typecheck, eslint, 172/172 vitest, scene React-free. ADR section 4 fidelity
verified row by row: three lanes with per-event glyphs; raw marks only at
spans of three days or less; LIVE-default right-docked playhead with one
mutation owning position and mode; unmistakable time-travel entry/exit
(colour flip, return-to-live, stage chip) with the mode flag ready for the
P10 ops-disable; scrub via the seq-cursor DeltaLog with an honest
fetch-counting test (two fetches on load, zero on local scrub, re-keyframe
on out-of-range); range-select verified as the single dateRange writer by
grep; event-click pulse carries node_ids. Contract splice (no-gap/no-dup at
the LIVE boundary, one clock) verified. The fourth seam amendment
({kind:"pulse", ids}) is ACCEPTED: optional, additive, token-guarded
renderer-side, flagged per the lock discipline.
**Phase verdict: W02.P08 PASS with findings. Wave W02 close: BLOCKED on
lens-scope-key-018 - the audit scheduled it for resolution before this
review; it remains unresolved with no recorded deviation. Everything else
about the wave is clear; 018 resolves (key by workspace+scope, or record
the deviation in the S31 record) and the wave closes.**

## timeline-raw-cap-020 | low | client renders raw event marks uncapped

`frontend/src/app/timeline/Timeline.tsx` renders every raw event with no
client-side cap; the never-unbounded guarantee currently rests entirely on
the engine honoring the bucket parameter. Safe against the mock; add a
client-side cap/down-sample or an asserted invariant as belt-and-suspenders
when convenient.

## timetravel-visibility-stale-021 | low | visibility membership computed over the live slice during time-travel

`frontend/src/app/stage/Stage.tsx` does not gate the set-visibility
membership effect on the timeline mode: while the time-travel driver pushes
historical set-data, membership is recomputed over the live slice, so the
two can momentarily disagree on node populations. Not a crash; untested at
the Stage integration level. Gate visibility on mode or compute membership
over the driver's pushed slice; scheduled for the P10/P12 integration
review.

### Review W03.P09 (left rail) - 2026-06-13

Reviewed: steps S37-S39, reviewer-agent sweep, gates re-run (typecheck,
eslint, 180/180 vitest, scene React-free, honest tests). Conformance clean
on the rows themselves: picker orders corpus-bearing worktrees first with
bare refs dimmed and degradation surfaced; browser is vault-scoped,
canonically grouped, glyphed, and verified read-only; bidirectional
selection joins on the contract stem id via one shared derivation and
reuses the P06 no-bounce pattern correctly.
**Phase verdict: PASS with findings, but CLOSURE WITHHELD pending a
required revision of 022 and 023 - the phase's own scope wiring introduced
two HIGH cross-scope-bleed defects that violate the wholesale-swap binding
(ADR section 2.1). Wave W02 close remains BLOCKED on 018, now unresolved
through a third review.**

## scope-swap-partial-reset-022 | high | setScope resets three slices; filters, lenses, pinned discoveries, and timeline mode bleed across scopes

`frontend/src/stores/view/viewStore.ts` setScope resets selection, working
set, and opened islands only. Surviving a wholesale swap: filter choices
(prior scope's vocabulary can render the new constellation filtered to
empty behind the hidden-count chip), pinned discoveries (old-corpus
semantic edges ride into the new slice), and timeline mode (the new scope
arrives pre-scrubbed to a timestamp from the prior corpus). The S37 record
describes the three resets accurately but records nothing about the four
survivals. Fix: reset pinnedDiscoveries and timelineMode (to live) in
setScope; reset or deliberately-and-recordedly preserve the filter store;
extend the scope-swap test to pin the full contract.

## pin-rekey-gated-on-live-023 | high | scope swap during time-travel persists pins under the wrong key

`frontend/src/app/stage/Stage.tsx` calls setScopeKey and
setPersistenceScope inside the data effect that early-returns unless
timeline mode is live and the slice is loaded; a scope swap during
time-travel (compounded by 022 not resetting the mode) leaves the pin
store keyed to the previous scope - prior pins stay loaded and toggles
write under the old scope's storage key. Concrete cross-scope persistence
corruption. Fix: drive the re-key from a scope-change effect independent
of timeline mode and slice readiness.

## dup-stem-derivation-024 | low | three stem-stripping derivations risk drift

The contract id derivation is correctly one function, but two sibling
helpers re-implement dir-strip plus md-strip. Fold them onto
pathToNodeId/nodeIdToStem so the stem rule has one home.

## timetravel-left-rail-undocumented-025 | low | browser stays live during time-travel with no recorded choice

The browser tree does not age with the playhead - defensible as
live-orientation, but no record states the choice. One sentence in the S38
record or P09 summary declaring it by design (or scheduling
reconciliation) closes this. Sibling of 021; both land at the P10/P12
integration review.

### Review W03.P10 (right rail) - 2026-06-13

Reviewed: steps S40-S42, reviewer-agent sweep, gates re-run (typecheck,
lint clean, 188/188 vitest, scene React-free). Conformance: now strip
renders stopped/crashed/absent as designed states with the SSE-delta /
status-snapshot recovery wiring correct on read; ops surface implements
exactly the R1 whitelist with a real two-step confirm and the time-travel
disable; inspector is selection-driven with the unfold-on-selection
per-tier edge list (the Bludau pattern) and evidence with resolution
states. Forward note for S49: the mock's ops route echoes verbs unchecked,
so whitelist enforcement currently rests on the GUI constant alone until
the live engine proxy enforces server-side.
**Phase verdict: PASS with findings; closure withheld on 026 and 027,
which join the standing revision commit (with 022, 023, 018).**

## ops-safety-behaviors-untested-026 | high | the ops surface's two safety behaviors have no tests

The only ops test asserts the whitelist constant. Untested: the two-step
arm-then-fire confirmation, and the disabled state of every verb in
time-travel mode (the G4.b gate the S41 row names). A regression firing a
verb on first click, or leaving verbs live during time-travel, passes the
suite green - the tautology risk in person: the test confirms typed data,
not built behavior. Add component tests exercising arm-fire and the
time-travel disable.

## inspector-content-preview-absent-027 | high | a plan-row responsibility silently deferred without an ADR flag

The S42 row and ADR section 2.3 name content preview as inspector scope;
no preview region exists, and the deferral rationale lives only in the
step record's notes. The contract's evidence documents carry no excerpt
field, so the deferral may be justified - but the plan's own Verification
discipline routes deviations to the ADR, never absorbs them in step notes.
Either render a preview of what is available or record the deferral as an
explicit ADR deviation against section 2.3.

## evidence-rule-not-rendered-028 | medium | correlated commits drop their attribution rule

The contract returns the rule that correlated each commit and the client
types it; the inspector renders sha and subject and drops the rule - the
provenance attribution that makes a correlated commit honest rather than
asserted. Invisible today because the mock omits the field. Render the
rule when present; consider a mock fixture carrying one.

## nowstrip-recovery-untested-029 | medium | the stream-to-snapshot recovery wiring has no test

The invalidate-on-transition effect is the behavioral heart of S40 and is
untested (only the pure rollup functions are covered). Failure mode is
staleness, not corruption; add a test when the ops component tests land.

## nowstrip-length-proxy-030 | low | recovery effect keys on stream length as a transition proxy

Functionally correct under append-mode streamedQuery, fragile under any
future reset/resync semantics. Key on the last frame's seq or a transition
counter when convenient.

## record-count-drift-031 | low | step records carry point-in-time test counts that drift

Recurring informational note (third occurrence); counts are honest at
their commits. No action beyond the established boundary-commit reading
practice.

### Consolidated-revision re-check (commit 3285f01) - 2026-06-13

All open required findings verified fixed in code with gates green
(typecheck, lint, build, 209/209 vitest across 43 files):

- 022 CLOSED: setScope is the wholesale swap (selection, working set,
  opened islands, pinned discoveries, timeline mode to live, cross-store
  filter reset), test pins the full contract.
- 023 CLOSED: a dedicated scope-only effect re-keys field persistence,
  pins, and lenses, independent of timeline mode and slice readiness.
- 018 CLOSED (fixed, not deviated): lens storage keyed workspace+scope on
  the pins pattern, wired from the same effect, isolation tested. 019
  CLOSED: builtin broken-links lens isolates to structural/broken.
- 026 CLOSED: real component tests (testing-library) prove arm-then-fire
  and the time-travel inert state. 029 CLOSED alongside.
- 027 CLOSED as a FORMALIZED DEVIATION: content preview deferred from v1
  because the contract's evidence capability carries no content field;
  the deviation is now annotated in the ADR section 2.3 by the ADR owner
  with the remedy filed as a contract wishlist item (excerpt field on the
  evidence capability). 028 CLOSED: correlation rule rendered when
  present, fixture carries one.
- Riders CLOSED: 020 (raw-mark cap), 021 (visibility gated on live mode),
  024 (one stem derivation), 025 (browser live-orientation declared).
- The P08 visual observations resolved: the playhead mid-rail reading was
  a real render bug (static-width fallback, no resize tracking), fixed
  with ResizeObserver-tracked widths; bucket magnitude encoding exists and
  the fixture's uniformity was data, not code.

**Consequences: P09 and P10 CLOSE. Wave W02 CLOSES (018 was its last
blocker). The withheld P11 and P12-partial reviews enter the queue.**

Process note for honest history: the apparent stop-order violations during
this arc were diagnosed as message-delivery batching - the fence,
stop-order, and down-tools instructions all queued during one long executor
turn and arrived after S46-S48 had been committed; the executor surfaced
this honestly and did not use it as a defense. The underlying
revision-starvation pattern was real, is owned, and is now codified as the
project-shared review-revision-precedence rule (commit 0fdcd44); phase
boundaries are mandatory executor turn boundaries going forward. Intent
framing in the escalation record is withdrawn accordingly.

### Review W03.P11 (palette, search) + W03.P12-partial (S46-S48) - 2026-06-13

Reviewed: steps S43-S48 plus the consolidated revision where it touches
these surfaces; reviewer-agent sweep, gates re-run (typecheck, lint,
209/209 vitest, scene React-free). Verified clean: R1 whitelist single-
sourced into the palette; node-id click-through; the rag-down fallback
never a dead control with the explicit offline notice (the ADR-binding
requirement met); degradation matrix function row-by-row tested for all
five rows; token mirror spot-checked exact between the CSS theme and the
GPU field constants with the interim convention recorded; bracket-step
playhead with LIVE transitions proven both directions; reduced-motion
honored at both the CSS floor and the scene fade layer; pulse timeout
token-guarded; no leak or crash paths.
**Verdicts: W03.P11 PASS with findings. W03.P12-partial REVISION REQUIRED
on finding 035 (one bounded HIGH); S49/S50 remain open by design.**

## palette-ops-logic-duplicated-032 | medium | palette duplicates arm-to-confirm and time-travel gating; only OpsPanel's copy is tested

The palette single-sources the whitelist and transport but reimplements
the two safety semantics (separate armed state; hide-on-time-travel vs
OpsPanel's disable-with-explainer), and no component test exercises the
palette's interactive arm-then-fire or its time-travel gate. Extract a
shared confirm primitive both surfaces consume, or add the palette
component test mirroring the 026 OpsPanel tests, before the arm semantics
are next touched.

## fallback-banding-weaker-033 | medium | fallback results are score-banded and notice-banded but not per-row distinct

Fallback rows render byte-identical to semantic rows; the distinction is
the capped score and the shared offline notice above the list. The S45
record is honest and the ADR-binding requirement (notice) is met; recorded
because a long scrolled list loses the notice context. Recommended: a
small per-row text-match tag or muted treatment.

## palette-not-on-primitives-034 | low | palette is hand-rolled DOM, not the committed primitive layer

The dialog is hand-rolled with no focus trap and no focus restore; the
header comment's "committed primitives" reads as stores/queries (true)
rather than the G5.c UI primitives (not used). A primitive dialog would
close the focus gaps for free. Fold into 038's a11y work.

## debug-switch-overclaim-035 | high | served-data degradation claimed for the whole matrix, delivered for rag-down only

The S46 record and commit message claim the debug switch drives the mock's
degrade() so served data degrades too; verified true only for rag-down
(tier content genuinely drops). Stream-lost, no-vault, and date-mandate
are UI-state overlays over un-degraded served data - the empty-vault
invitation paints over a stage still holding the full corpus. A
truthfulness gap inside the truthfulness feature. Revision: extend the
mock so all four switchable conditions degrade served data end-to-end, or
amend the S46 record and commit message to state plainly that only
rag-down is end-to-end and the rest are designed overlays. Bounded fix;
REVISION not FAIL.

## degradation-inputs-hardwired-036 | low | broken-count and stream-lost inputs are debug-only seams

deriveInputs hardwires brokenLinkCount and streamLost with honest deferral
comments; live derivation lands with the edge layer and stream consumer at
the S49/S50 swap. Recorded so the seam is not lost; consistent with the
fence.

## degradation-subscription-hack-037 | low | reactivity rides a void-subscription decoupled from the value source

useSurfaceStates subscribes to overrides solely for re-render while the
value flows through an imperative get(); a reader deleting the apparently
dead line breaks reactivity silently. Pass the subscribed overrides into a
pure resolve so subscription and computation share one source.

## a11y-floor-gaps-038 | medium | focus trap, focus restore, live-region, and the unproven AA claim

The keyboard floor is genuinely strong (tested cycle/bracket-step/LIVE
transitions, form-target yielding, two-layer reduced motion), but: the
palette lacks a focus trap and focus restore; arrow-walk selection changes
announce nothing to screen readers; and the WCAG AA claim has no automated
contrast check over the token pairs. G7.d names AA and keyboard
operability as the floor - prove the claim with a contrast smoke test and
close the palette focus gaps (likely via 034's primitive dialog).
