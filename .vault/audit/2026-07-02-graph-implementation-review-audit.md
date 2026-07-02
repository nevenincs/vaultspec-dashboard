---
tags:
  - "#audit"
  - "#graph-implementation-review"
date: '2026-07-02'
promoted_to:
  - 'rule:graph-layout-is-pin-authoritative-not-force-converged'
modified: '2026-07-02'
related:
  - '[[2026-07-02-global-state-review-audit]]'
---
# `graph-implementation-review` audit: `graph implementation architecture review`

## Scope

A standing high-level architecture review of the graph implementation, in four passes:
(1) the backend-to-frontend data → node/edge flow (engine projection → `/graph` wire →
stores → `SceneController` → scene); (2) the vault-node representation's simulation,
filtering, selection, and autoframing; (3) the alpha-decay force model's stability
("achieves stability but the implementation is suspicious"); (4) the graph ↔
global/TanStack state integration. Grounded in the codified rules
(`present-view-graph-reads-one-corpus-snapshot`, `graph-compute-is-cpu-gpu-is-render-and-search`,
`derived-projections-memoize-on-the-graph-generation`, `graph-queries-are-bounded-by-default`,
`graph-canvas-is-portal-pinned-never-reparented`, `dashboard-layer-ownership`,
`views-are-projections-of-one-model`, `stable-selectors`,
`bounded-by-default-for-every-accumulator`). Audit-only; no product code changed.

Epicenter files: `frontend/src/scene/three/d3ForceSolver.ts`,
`frontend/src/scene/three/threeField.ts`, `frontend/src/scene/sceneController.ts`,
`frontend/src/app/stage/Stage.tsx`, `frontend/src/stores/server/graphSync.ts`,
`frontend/src/stores/server/liveAdapters.ts`,
`frontend/src/stores/view/dashboardFilterChoices.ts`, `frontend/src/stores/view/selection.ts`,
`engine/crates/vaultspec-api/src/routes/query.rs`, `engine/crates/engine-query/src/graph.rs`.

Finding IDs are stable (`GIR-###`); severities HIGH/MEDIUM/LOW.

## Findings

### GIR-001 | medium | The "settled" layout is not a force fixed point — stability is enforced by freeze + pins, and residual energy discharges on any global unpin

The solver's own header admits it: `forceCollide` is not alpha-scaled, so the force field
never fully cools; a dense graph "settles" only because `tick()` freezes it at `alphaMin`
via `sleepAll()` (pin every node with `fx`/`fy`) — `d3ForceSolver.ts:24-29` and
`d3ForceSolver.ts:490-495`. The rest state therefore stores residual collide/centering
force, and the "settled layout is authoritative" invariant rests on pins, not physics.
Failure scenario: any path that runs `wakeAllFree()` plus an alpha pump on a settled
layout — `reheat(false)` at WARM_ALPHA 0.5, or `setParams` without a `reheatAlpha` —
visibly displaces nodes the user believes are at rest (this was measured by the since-
removed settle-probe diagnostic, whose DEFECT A recorded non-trivial per-node speed on
the tick before freeze and whose DEFECT B recorded `reheat(false)` moving settled nodes).
Mitigations are real and layered: the gentle change-proportional reheat
(`reheatGentle`, `forceChangeFraction`) tames the slider path, and the unified
`prewarmReflow` discipline (`threeField.ts:1134-1149`) pins carried survivors on EVERY
warm path so additive updates never re-simulate settled nodes. But the deeper fix the
code itself names — alpha-annealing the collide force so rest is a true fixed point
(`d3ForceSolver.ts:602-603`) — remains deferred, and every remaining global-unpin path
is a live discharge valve (see GIR-002/GIR-003). Verdict on the mandate's question:
stability is real but ENGINEERED (freeze-by-fiat + pin-authoritative layout), not
emergent convergence; the engineering is internally consistent and test-covered, with
the exceptions below.

### GIR-002 | medium | `set-simulation-active: true` claims an energy-neutral resume but runs the violent `reheat(false)` — a seam member with a false contract comment

`threeField.ts:875-880` handles `set-simulation-active` under the comment "Resume/pause
is energy-neutral: just toggle ticking, never re-pump heat" — but the `active:true`
branch calls `resume()` (`threeField.ts:1612-1619`), which runs
`this.solver.reheat(false)`: `wakeAllFree()` + alpha pumped to WARM_ALPHA (0.5). Per
GIR-001 that displaces a settled layout (the deleted settle-probe's DEFECT B measured
exactly this call shape moving settled nodes, and its "FIX shape" test showed the
energy-neutral alternative: tick without reheat). The sibling `set-frozen` path WAS
fixed to be a true pause/resume (issue #5, `threeField.ts:884-897`), but the fix never
reached `resume()`. Today the defect is DORMANT in product paths — the only
`set-simulation-active` dispatcher is the `three-lab` dev harness
(`frontend/src/three-lab/ThreeLab.tsx:332`); the product freeze toggle rides
`set-frozen` (`frontend/src/stores/view/graphCommands.ts:35`). But the seam member is
public on the locked `SceneCommand` union, its comment asserts the opposite of its
behaviour, and the first future consumer inherits the displacement bug. Fix shape:
make `resume()` energy-neutral (set `running = true` and wake the loop without
`solver.reheat`), reserving re-energise for `reheatNow()`.

### GIR-003 | low | `D3ForceSolver.setParams()` defaults to the violent full warm reheat; every product caller must remember to pass `reheatAlpha`

`d3ForceSolver.ts:701-714`: omitting `reheatAlpha` falls back to `reheat(false)` —
the WARM_ALPHA global re-explode. The one product caller (`threeField.setForceParams`,
`threeField.ts:1635-1648`) always passes the gentle proportional alpha, so the default
branch is dead in the shipped path — which makes it a pure footgun: the API's default
is the behaviour the codebase spent a campaign eliminating. Inverting the default
(gentle unless explicitly cold) or requiring the parameter would align the API with
the discipline.

### GIR-004 | low | Latent sleep-invariant hole on a drag hand-off: the previous dragged node keeps a stale rest while pinned elsewhere

`setDrag(newIndex)` without an intervening `clearDrag()` (`d3ForceSolver.ts:633-656`)
leaves the OLD dragged node asleep (`awake=0`) pinned at its last cursor position while
its `restX/restY` still record its grab point — violating the documented "a sleeping
neighbour is pinned at its rest, so its position IS its rest" assumption that
`propagateWake` reads (`d3ForceSolver.ts:575-577`). Currently unreachable through the
UI (pointerup/pointercancel/touchstart all run `endNodeDrag` before a new grab), so
this is a latent invariant hole, not a live bug. A one-line guard in `setDrag` (release
the prior drag index when it differs) would make the invariant hold unconditionally.

### GIR-005 | low | Doc drift: the alpha-decay schedule comment describes d3's default, not the shipped schedule

`d3ForceSolver.ts:117-118` documents `alphaDecay` as "default 0.0228 ≈ 300 ticks to
settle", but the canonical schema default (`graphControlSchema` `simulationDefaults`,
asserted in `graphControlSchema.test.ts`) is `alphaDecay: 0.05` with `alphaMin: 0.005`
— ≈ 100 ticks from cold, ≈ 90 from warm. The shipped schedule is roughly 3× more
decisive than the comment claims. Trivial, but the comment is the first thing a tuner
reads when reasoning about convergence.

### GIR-006 | medium | The live-delta "splice" path is O(whole graph), not O(delta): every `apply-deltas` batch rebuilds the solver and all GL resources

`threeField.applyDeltas` (`threeField.ts:1178-1192`) folds the delta batch by id and
re-runs full `setData` — new `D3ForceSolver` construction (adjacency, forces, links),
full node/edge/glyph instanced-buffer rebuild and material re-creation, per feature-
delta batch off the SSE stream. The warm-start + `prewarmReflow` pinning makes this
visually silent (zero ticks for a same-id-set change), and the batch is capped
(`GRAPH_FEATURE_DELTAS_CAP` 128), so it is bounded — but the stated point of the
spliceLive path (stores comment: "feature-node and meta-edge changes animate without a
constellation refetch") is realised only on the wire; the client pays a full O(N + E)
rebuild per batch regardless. At constellation scale (~100s of nodes) this is cheap; at
the 20k defensive ceiling it is a per-delta jank source. Related staleness: the
`SceneController`'s own held model is updated only by `set-data`
(`sceneController.ts:459-463`) — `apply-deltas` bypasses it, so `nodeCount`/`edgeCount`
lie after a splice (test-surface only today, but it is the controller's advertised
model). An incremental path (solver `addNode`/`removeNode` or attribute-level patch)
is the eventual fix; short of that, the controller should at least fold deltas into its
held arrays so the seam's model stays truthful.

### GIR-007 | low | `mergeSlices` (model derivation) lives in the app layer, inside a component file

`frontend/src/app/stage/WorkingSet.tsx:25-40` defines the pure `mergeSlices` union
(constellation + ego expansions by stable id) and `Stage.tsx:264-293` composes
`merged`/`displaySlice` from it. `dashboard-layer-ownership` assigns derived-data
computation to the stores layer; chrome "renders store and scene state and computes no
derived data". The function is pure, unit-tested, and fed exclusively by stores hooks,
so the violation is placement, not wiring — but it is exactly the kind of derivation
(`views-are-projections-of-one-model`'s client-side model composition) that belongs
next to `filterSliceByMembership` in `stores/view/`. Moving it (and the `merged`
composition into a stores-owned hook) would restore the boundary.

### GIR-008 | medium | An empty `set-data` leaves ghost node state: stale `idToIndex`/`cpuPositions` keep serving anchors and focus targets for nodes that no longer exist

`threeField.setData` with `nodes.length === 0` (`threeField.ts:1017-1028`) calls
`disposeGraph()` and returns early — but `disposeGraph` (`threeField.ts:1454-1479`)
clears meshes, solver, `nodes`, and edge state while leaving `idToIndex`, `neighbors`,
`featureCohort`, and `cpuPositions` populated from the PREVIOUS graph. After the early
return, `emitAnchors` (`threeField.ts:1878-1891`) still resolves tracked ids through
the stale `idToIndex` into the stale `cpuPositions` and emits live screen anchors, so a
DOM island/hover card can hover over an empty canvas; `focusNode` (`threeField.ts:2474-2491`)
will likewise centre the camera on a ghost position instead of recording a pending
focus. Reachable in product: reflow filter mode ON + a filter matching nothing feeds
`setData([], [], true)` (Stage's `displaySlice` path). The non-empty path is safe (it
rebuilds the index before use). Fix shape: clear the id/adjacency/position state in
`disposeGraph` (or on the `n === 0` early return) so an empty graph is empty everywhere.

### GIR-009 | info | What held up under review (batch 1 positives)

For the record, the load-bearing disciplines verified sound in this pass: (a) wire
ingestion is DOUBLE-bounded with honest truncation — stores adapter
(`liveAdapters.ts:184-262`, `MAX_CLIENT_GRAPH_NODES/EDGES`, self-consistent edge drop)
plus the scene's own `MAX_SCENE_NODES` clamp with a `graph-truncated` event
(`threeField.ts:992-1004`); (b) the delta clock is hardened per the graph-edge-artefact
campaign — backward-seq → re-keyframe, empty-reconnect → re-keyframe, per-scope stream
keys, prompt removal of superseded since-keyed stream cache entries
(`graphSync.ts:246-342`); (c) stable-selector discipline holds at the seams checked —
`useGraphLiveDeltaView` returns ref-stable normalized state under `useShallow`,
`useDashboardVisibilityCommand` derives in `useMemo` over raw inputs
(`dashboardFilterChoices.ts:31-48`); (d) the engine side conforms to its rules —
generation-memoized projections, `MAX_GRAPH_NODES`/`MAX_DOCUMENT_NODES` ceilings with
honest `truncated` blocks, self-consistent meta-edge pruning on the filtered feature
path (`routes/query.rs:492-512`, `engine-query/graph.rs` `DocumentViews`); (e) the
scene never fetches, chrome never reads the wire, commands/events are the only
crossing (`Stage.tsx`, `sceneController.ts`) — `dashboard-layer-ownership` honoured end
to end apart from GIR-007; (f) solver state is fully bounded (fixed typed arrays per
node count; no growing accumulator found in the sim core).

### GIR-010 | high | `/graph/diff` serializes an unbounded full-fat delta log — the one graph wire surface with no ceiling and no truncated block

`engine-graph/src/diff.rs:73-131` computes the full symmetric difference between two
graph snapshots — one `DiffEntry` per changed node/edge, each carrying the COMPLETE
serialized `Node` (facets included) or `Edge` — and the `/graph/diff` route
(`vaultspec-api/src/routes/temporal.rs:458-563`) serializes `log.entries` onto the wire
with no node ceiling, no delta cap, and no honest `truncated` block. Every sibling
surface is bounded: `/graph/query` and the as-of keyframe ride `bound_slice` under
`MAX_DOCUMENT_NODES`, lineage rides `bound_range`, egos ride `bound_ego`. A diff
between two distant refs is effectively TWO full document slices (~2×(N+E) full-fat
entries) — exactly the body `graph-queries-are-bounded-by-default` forbids ("no engine
endpoint may serialize an unbounded full-document slice onto the wire"). Reachable in
product: every out-of-range time-travel scrub calls `source.diff(scope, t − 14d, now)`
(`frontend/src/app/timeline/timeTravel.ts:138-172`), so scrubbing back on a churning
corpus ships an unbounded multi-MB body on a user gesture. Fix shape: cap the emitted
log (a delta ceiling with an honest `truncated`/`gap` block the client already knows how
to answer with a re-keyframe), or degrade an over-ceiling diff to a keyframe-only
response.

### GIR-011 | medium | The client `DeltaLog` is an unbounded accumulator; the time-travel ingest has no client-side ceiling

`frontend/src/scene/deltaLog.ts:35-106`: `deltas: SceneDelta[]` appends with no cap,
TTL, or ring — its only bound is whatever the server sends, and per GIR-010 the server
sends everything. The stores-side ingest (`timeTravel.ts:150-168`) maps and holds the
full diff response with no `MAX_CLIENT_*` clamp, unlike the keyframe path
(`liveAdapters.ts` `MAX_CLIENT_GRAPH_NODES/EDGES`) and the live-splice path
(`graphSync.ts` `GRAPH_FEATURE_DELTAS_CAP` 128). This is the exact
`bounded-by-default-for-every-accumulator` shape: a retained list with no bound at
creation, on the same wire the sibling paths defensively clamp. The log IS reset on
every re-keyframe (`setKeyframe` empties it) so it does not grow across sessions —
the exposure is a single oversized scrub window, which is why this is MEDIUM and
GIR-010 (the producer) is the HIGH. Fix travels with GIR-010: a delta cap at append
plus the existing `needsKeyframe` fallback.

### GIR-012 | medium | Any background live delta re-engages autoframe and yanks a manually-positioned camera

The arbitration model treats every `setData` as a "STATE change" that re-engages
autoframe (`threeField.ts:1160-1165` → `reengageAutoframe`, `threeField.ts:2331-2346`),
clearing the manual-nav suspension AND nulling `autoframedFrame` so the poll measures
drift from the CURRENT camera. But `applyDeltas` funnels every live SSE feature-delta
batch through `setData` (`threeField.ts:1178-1192`). Sequence: user has autoframe ON,
manually zooms into a cluster (→ `disengageAutoframeForUserNav`, camera held); an
unrelated background vault edit emits a delta; Stage dispatches `apply-deltas`
(`Stage.tsx:340-344`) → `setData` (warm, no fit) → `reengageAutoframe` → poll compares
the whole-graph fit against the user's zoomed-in camera → drift far beyond the deadband
→ the camera eases away to the whole-graph frame while the user is reading. The #13
arbitration intended "data change" to mean a user-initiated load/filter/expansion; the
delta path makes it include ambient background churn, which is precisely the "yank the
view back" behaviour `disengageAutoframeForUserNav` exists to prevent. Fix shape:
suppress the re-engage for delta-driven warm set-datas (e.g. `applyDeltas` passes a
flag, or re-engage only when `!warm` / `reflow` / an explicit load), leaving
filter/appearance/force re-engages as they are.

### GIR-013 | info | Engine `graph_query` internals verified sound (batch 3 close-out)

Direct read of `engine-query/src/graph.rs` (`graph_query_inner`, `build_document_views`,
`bound_slice`) confirms the rule conformance previously inferred from route snippets:
every facet — including the graph-context `health` and per-scope `plan_states` — is
applied ENGINE-side before either granularity projects
(`node-facets-filter-on-the-engine`); both granularities prune to a self-consistent
subgraph (document `endpoint_ok` with the deliberate broken-lens dangling exception;
feature meta-edges retained only between kept features); `bound_slice` enforces
`MAX_GRAPH_NODES` (5000) with deterministic id-sorted truncation and an honest total;
and the heavy per-item projections are memoized per graph generation
(`derived-projections-memoize-on-the-graph-generation`) with a never-wrong fallback to
fresh projection on a cache miss. The `index`/`code` exclusion runs before aggregation
so neither slice ever sees a non-displayable node. No new defect found in this pass;
`/graph/diff` (GIR-010) remains the single unbounded outlier on the temporal wire.

### GIR-014 | low | Feature-granularity diff path lacks the explicit delta ceiling the document path now carries (symmetry follow-up, not a live defect)

Surfaced during the GIR-010 remediation: the `/graph/diff` FEATURE-granularity arm —
`engine_query::graph::feature_delta` (`engine-query/src/graph.rs:847`), dispatched from
the diff route's `Granularity::Feature` match arm
(`vaultspec-api/src/routes/temporal.rs:540-544`) — emits its delta list with no
explicit delta cap, while the document arm is now bounded by the shipped GIR-010 fix.
It is meaningfully lower risk than the document path was: the emitted set is
feature-count-bounded BY CONSTRUCTION (documents aggregate into feature-convergence
nodes plus meta-edges, so the log scales with the feature count, not the document
count), which is why this is LOW and deferred rather than part of the GIR-010 fix.
Failure scenario (bounded but real): a pathological or future corpus with a very large
feature vocabulary makes the feature diff a large single body with no honest
truncation/gap signal, silently diverging from the document arm's now-explicit
contract. Fix shape: apply the same delta ceiling + truncation/gap block the document
arm now carries, so both granularities of the one diff route share one bounding
contract. Recorded as a symmetry hardening follow-up behind the shipped GIR-010
document-path fix — not a live defect.

### GIR-015 | medium | Over-ceiling LIVE commit broadcasts silence: the claimed generation-bump backstop does not reach clients, leaving unbounded silent staleness until the next commit

Follow-on from the GIR-010/GIR-014 bounding fix. Both diff species now degrade to
keyframe-only (empty entries) above `MAX_DIFF_DELTAS` (20,000), and on the LIVE
commit-broadcast path (`vaultspec-api/src/app.rs:863-888` in `commit_graph`) the
truncation block is deliberately ignored — an over-ceiling commit broadcasts ZERO
chunks on the `graph` channel and does not advance the per-scope seq clock. The
in-code safety comment asserts "live clients recover via generation-invalidation
refetch (the generation bump is the backstop)" — but that backstop is NOT wired: the
generation counter is server-side only, and the client's ONLY invalidation trigger is
stream-chunk processing (`graphSync.ts:256-342` — document-granularity chunk, seq gap,
or empty-reconnect). No chunk ⇒ the effect never runs ⇒ no invalidation. Verdict
split: the degradation IS safe against CORRUPTION — no partial mutation log is ever
applied, no gap is manufactured, an SSE reconnect re-keyframes, and the NEXT commit's
document-granularity deltas trigger the debounced full refetch which heals everything.
It is NOT safe against STALENESS: between the over-ceiling commit and the next
commit/reconnect, every live client silently misses the 20,000+ changes — an
unbounded-in-TIME window, on exactly the commit class MOST in need of a refetch, with
the stream looking healthy throughout (the unadvanced clock means the next commit's
deltas splice gaplessly onto the stale graph). The invariant that breaks: every corpus
change must be CLIENT-VISIBLE on the live stream — degradation may drop the deltas,
never the signal. Fix shape (no frontend change needed): when either diff degrades on
the live path, reserve one seq position and broadcast a single synthetic re-keyframe
marker entry on the `graph` channel (op `truncated`/`rekeyframe`, non-`feature`
granularity, the advanced seq, riding the resume ring). The client's existing
`sawDocumentDelta` branch already routes any non-feature graph chunk to
`invalidateConstellation` → debounced full slice refetch, and a `since=` resume
replays the marker harmlessly. Update the `commit_graph` comment to state the actual
mechanism.

## Global-state and filtering surface (second audit scope, user-briefed 2026-07-02)

Second surface briefed directly by the user: application global view/UI state
(selection, highlighting, filtering) and the filtering data path. Its findings were
initially appended here, then MOVED at the user's direction to their own audit
document, `2026-07-02-global-state-review-audit` (feature `global-state-review`,
linked in this document's related field). Finding IDs there are `GS-###` (GS-001,
GS-002 info/verified-sound; GS-003, GS-004 medium; GS-005 low); this section remains
as the cross-reference so the two surfaces of the standing review stay discoverable
from one ledger.

## Recommendations

- Make `resume()` energy-neutral (GIR-002) and align the `setParams` default with the
  gentle-reheat discipline (GIR-003); both are small, and the settle-probe's "FIX
  shape" test can be resurrected as the guard.
- Clear `idToIndex`/`neighbors`/`featureCohort`/`cpuPositions` in `disposeGraph`
  (GIR-008).
- Schedule the alpha-annealed collide refinement (GIR-001) as the durable fix that
  retires the freeze-by-fiat caveat, or codify the pin-authoritative model as the
  accepted design.
- Fold `apply-deltas` into the controller's held model and consider an incremental
  solver update path when live-delta volume grows (GIR-006).
- Rehome `mergeSlices` + the merged-slice composition into `stores/view/` (GIR-007).
- Fix the `alphaDecay` comment (GIR-005) and add the `setDrag` hand-off guard
  (GIR-004) opportunistically.
- Bound `/graph/diff` with a delta ceiling + honest truncation/gap block (GIR-010) and
  cap the client `DeltaLog` append with the `needsKeyframe` fallback (GIR-011) — the
  one remaining unbounded graph wire surface and its unbounded client accumulator.
- Gate autoframe re-engagement to user-initiated data changes so a background SSE
  delta cannot yank a manually-positioned camera (GIR-012).
- When convenient, extend the GIR-010 delta ceiling + truncation/gap contract to the
  feature-granularity diff arm for cross-granularity symmetry (GIR-014, deferred).
- Broadcast a single seq-advancing re-keyframe marker on the `graph` channel when a
  live commit's diff degrades to keyframe-only, so an over-ceiling commit is
  client-visible and triggers the existing invalidation refetch instead of silent
  staleness; correct the `commit_graph` backstop comment (GIR-015).
- The GS-### recommendations (reveal-selection scrolls, visibility-gated
  rings/anchors, mask-mode affordance policy) live with their findings in
  `2026-07-02-global-state-review-audit`.
