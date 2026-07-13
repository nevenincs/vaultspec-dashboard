---
tags:
  - '#audit'
  - '#graph-simulation-stability'
date: '2026-07-02'
modified: '2026-07-12'
related:
  - "[[2026-07-02-graph-implementation-review-adr]]"
  - "[[2026-06-16-graph-force-stability-adr]]"
---

# `graph-simulation-stability` audit: `settle-on-swap non-convergence`

## Scope

Diagnostic audit of the graph force-simulation and its state management, triggered by a
live defect report: switching filters or the vault|code view mode (corpus), and timeline
events, sometimes leave the layout frozen-but-tense — the simulation is not settled yet
is throttled/frozen, and nodes rest in a disorganized non-settled arrangement.
Continuously wiggling the force sliders injects energy and lets the layout settle, which
should never be necessary.

Audited surfaces: the solver settle/freeze lifecycle (`frontend/src/scene/three/d3ForceSolver.ts`
— alphaMin freeze, `sleepAll` pinning, `reheat`/`reheatGentle`/`prewarmReflow`, the
same-id-set zero-tick guarantee); the stores→scene data-swap plumbing (graph query keys,
`placeholderData: keepPreviousData`, the view-mode intent seam, timeline-driven
refetches, cold-vs-warm classification in the scene assembly); and the render/tick loop
throttling plus the interactive energy paths (force sliders, drag `alphaTarget` holds)
that explain why manual slider wiggling settles the graph when the automatic swap paths
do not. Grounded in the accepted Option B stability model (freeze-at-alphaMin +
pin-authoritative rest) and its guarded invariants.

## Findings

### edge-only-change-zero-ticks | high | A same-node-id swap with changed EDGES does zero ticks and freezes the layout arranged for the OLD edges

The clearest frozen-but-tense reproduction. `prewarmReflow`'s `isNew` predicate
(`threeField.ts:1212`) is `(i) => !prevPos.has(nodes[i].id)` — it inspects only node
ids, never edges. When a swap re-serves the SAME node id set with a DIFFERENT edge set
(the `relations` filter facet; a timeline as-of slice at `timeTravel.ts:118` where nodes
persist but declared edges differ), every node carries over, `movable === 0`, and
`prewarmReflow` returns `0` at `d3ForceSolver.ts:477-481` with all nodes pinned at their
prior positions. The freshly constructed solver (`threeField.ts:1128`) holds the NEW
adjacency but never ticks: nodes freeze at positions optimal for the OLD topology with
the new edges stretched or crossed over them, and `running = !isSettled()` goes false at
`threeField.ts:1225`. The settle-probe guard (c)
(`d3ForceSolver.settle.test.ts:156-177`) blesses "same-id-set ⇒ zero ticks" as correct,
but that guarantee silently assumes edges track nodes — it does not hold under an
edge-only facet change. The `graph.md` "same-id-set update ticks zero" rule presumes
same ids means same topology.

### warm-reflow-pins-stale-survivors | high | The reflow warm gate (`carried > 0`) pins ALL survivors even for a large-topology-change, few-carried swap

At `threeField.ts:1178-1180` the filter-reflow warm gate is `nodes.length > 0 &&
carried > 0` — deliberately bypassing the `carried >= 0.5 * nodes.length` cold gate
used on the non-reflow path (comment at `threeField.ts:1172-1177`). A reflow sharing
even ONE id with the prior slice pins every survivor at its carried position and
relaxes only the new nodes. When the new corpus overlaps the old by a handful of ids
(feature/doc_type facet switches; a code↔vault corpus toggle routed as a filter reflow
via `stores/view/filters.ts:346`), the few survivors are pinned at positions
meaningless for the new graph while the many new nodes must arrange around a wrong,
immovable skeleton. The non-reflow path's own comment (`threeField.ts:1158-1160`)
names this exact hazard — "a partial-overlap that shares just a few ids must NOT warm,
or its many new nodes under-settle at the low warm alpha into an off-screen clump" —
which the reflow path invites by dropping the half-carried guard. This produces the
reported disorganized non-settled arrangement, frozen.

### fixed-warm-alpha-premature-freeze | high | New nodes relax at a FIXED alpha 0.3 that does not scale with new-node count; the alphaMin freeze pins them mid-arrangement

`prewarmReflow` sets `this.sim.alpha(startAlpha)` to a fixed `WARM_START_ALPHA = 0.3`
(`d3ForceSolver.ts:482`, `graphControlSchema.ts:300-311`), giving new nodes ~78
decaying ticks (alphaDecay 0.05 → alphaMin 0.005). Alpha scales link/charge/centering
but NOT collide (`d3ForceSolver.ts:26-29`), so at low alpha new nodes resolve overlaps
but are only weakly pulled toward their correct cluster positions. For a large
new-node batch, 0.3 exhausts before positioning completes; the freeze guard
(`d3ForceSolver.ts:506-509`) then `sleepAll()`-pins them wherever they sit — reachable
synchronously inside `prewarmReflow`'s own loop (`d3ForceSolver.ts:485-490`), which
returns with `isSettled() === true` so `running` goes false and no further ticks
arrive. This is awake==0 while the layout is genuinely NOT relaxed — beyond the
accepted Option B residual (~1e-5 collide float-noise on an otherwise-relaxed layout).
The ADR's own `forceChangeFraction` proportionality principle is applied only to the
slider path (`threeField.ts:1728`), never to the data-swap path.

### survivor-mispin-on-interrupted-settle | high | A data swap landing while the prior layout is still relaxing pins every survivor at its mid-convergence position and freezes the disorganized state permanently

`setData` unconditionally captures the previous layout from `cpuPositions` into
`prevPos` (`threeField.ts:1076-1081`) without checking whether the prior solver had
settled. On the warm path it seeds those positions and `prewarmReflow` pins ALL
survivors — its doc comment promises "the survivors hold their exact prior positions"
(`d3ForceSolver.ts:445,478-480`), silently assuming those positions are settled. But
the prior settle frequently is NOT complete: a cold/large swap runs `prewarm()` under
a tick-cap AND a 260 ms wall-clock budget (`d3ForceSolver.ts:431-436`) and on breach
exits non-converged with `running = true` (`threeField.ts:1225`), finishing in the
live loop. Filter toggling and timeline scrubbing emit a STREAM of `set-data`, so the
next swap routinely arrives while the live loop is still relaxing; that swap captures
mid-settle positions, pins them, and — with few or zero new nodes — does few or zero
ticks and drops `running` to false. The layout is frozen in a genuinely non-converged
(overlapping, tangled) arrangement. Concrete repro: scrub the timeline or rapidly
toggle a filter facet on a ~300-node slice where consecutive slices share ≥50% of ids;
each slice interrupts the previous settle and re-pins survivors mid-flight, accreting
into a frozen tangle only a slider clears.

### no-settle-watchdog | medium | Once `running` is false with a non-converged pinned layout, nothing re-examines it; the freeze is permanent until the next user command

`isSettled()` consumers are the frame loop (`threeField.ts:1887`), `resume()`
(`threeField.ts:1707`), the `set-frozen` unfreeze (`threeField.ts:930`), and `setData`
(`threeField.ts:1225`) — each reads settledness only at the moment of an external
event. The frame loop stops scheduling once `running` is false (`threeField.ts:1917`)
and nothing ever recomputes "the layout is pinned but not actually relaxed," so the
mispin freezes above cannot self-heal; they persist until a slider, drag, explicit
reheat, or another swap.

### stale-alpha-one-after-same-id-reflow | medium | A same-id-set warm reflow leaves the fresh solver's alpha at the d3 default of 1, so the next gentle reheat over-heats into a full cold explode

`setData` constructs a NEW `D3ForceSolver` every call (`threeField.ts:1128`); on the
warm path `prewarmReflow` is the first energy call on that instance. When
`movable === 0` it early-returns BEFORE `this.sim.alpha(startAlpha)`
(`d3ForceSolver.ts:477-481`), so the simulation's alpha remains d3's constructor
default of 1 (`.stop()` at `d3ForceSolver.ts:268` does not lower it). `isSettled()`
still reports true (all pinned), so this is invisible — until the user moves a slider:
`reheatGentle` computes `sim.alpha(Math.max(sim.alpha(), kick))` = `Math.max(1, ~0.15)`
= 1 (`d3ForceSolver.ts:625`), a full cold-magnitude re-explode instead of the intended
gentle in-place kick. Settle-guard (c) misses this because it pre-runs `prewarm()`
(decaying alpha below alphaMin) before `prewarmReflow`
(`d3ForceSolver.settle.test.ts:160-164`), whereas the real path has no prior prewarm on
the fresh instance — a test-vs-production divergence.

### frozen-not-honored-across-set-data | low | A data swap ignores the user's freeze: it re-runs the synchronous prewarm and sets `running = true` despite `frozen`

`setData` has no `frozen` guard and unconditionally runs `prewarm`/`prewarmReflow` and
sets `running = !isSettled()` + `wake()` (`threeField.ts:1214-1244`); the frame loop's
tick gate checks only `running`, not `frozen` (`threeField.ts:1880`). After the user
freezes the sim (`set-frozen`, `threeField.ts:927-929`), any background `set-data`
(ambient SSE delta, re-fetch) re-solves and resumes ticking, breaking the freeze
contract. Low severity because freeze is a lab/manual affordance.

### compounding-pins-across-successive-swaps | medium | Survivor pins are released only by a wakeAllFree path; consecutive warm swaps compound staleness until a slider/reheat fires

Once a warm reflow pins survivors and freezes, the only unpinning paths are
`wakeAllFree()`-bearing calls — `reheat`, `reheatGentle`/`setParams`/`setRadii`, cold
`prewarm` (`d3ForceSolver.ts:315-325,607,624,736,756,427`). A subsequent warm
`set-data` re-runs `prewarmReflow`, which wakes all free then immediately RE-pins the
carried survivors at their already-stale positions (`d3ForceSolver.ts:458-476`). So
successive filter/timeline changes pin survivors at ever-staler coordinates and never
grant a global re-settle. This explains both the progressive degradation and the
user's exact workaround: the slider wiggle (`setParams` → `reheatGentle` →
`wakeAllFree` → global unpinned settle) is the only ambient path that re-settles the
whole layout.

### guard-gap-no-adversarial-reflow-coverage | medium | The settle-probe suite covers only the happy paths; the failing swap scenarios are untested

`d3ForceSolver.settle.test.ts` covers (a) energy-neutral resume on an already-settled
layout, (b) `reheatGentle` never lowering alpha, (c) same-id-set zero ticks, (d) the
alphaMin freeze on a cold reheat. None exercise the failing scenarios: a warm reflow
with many new nodes and few carried survivors asserting the new nodes actually
separate and position (bounded residual per-node speed, no residual overlap at
freeze), or an edge-only change under a constant node id set asserting the layout
re-relaxes. Guard (c) actively certifies the edge-blind zero-tick behavior as correct.
The R4 resurrected DEFECT-A measurement covers only the settled/cold case
(`d3ForceSolver.settle.test.ts:182-225`), not the warm-reflow-many-new case where it
bites.

### mid-settle-freeze-escalation | critical | The mid-settle pin is CRITICAL: the store plumbing routinely delivers overlapping-id set-data streams into an unsettled layout, unifying all three reported triggers

Escalation and store-side confirmation of `survivor-mispin-on-interrupted-settle`: the
warm/cold classification consults only id-overlap (`carried >= 0.5 * n`, or
`carried > 0` under reflow), never the prior solver's `running`/`isSettled()` state —
`setData` discards the prior solver entirely (`threeField.ts:1128`) — so the
pin-authoritative discipline's own precondition ("the carried survivors are AT REST")
is unenforced. The stores side makes the violating delivery routine, not rare:
(a) a filter facet or timeline `date_range` change re-queries with an overlapping id
set (`queries.ts:3011-3012,3087-3095`) and can land while the prior layout is still
cooling; (b) on the CODE corpus the query key still contains `filter` even though the
`queryFn` ignores it for code (`queries.ts:3087-3114`), so any left-rail filter toggle
re-fetches an IDENTICAL code id-set and, landing mid-settle, pins and freezes it —
matching the report that the symptom concentrates around code|vault mode use;
(c) timeline scrubs stream consecutive overlapping slices. Applying the zero-tick pin
path to an unsettled layout violates the Option B model's own premise; the primary
view is left broken until a manual energy injection.

### no-coalescing-rapid-setdata | high | Rapid successive deliveries each fully rebuild the solver from the previous mid-flight positions, compounding the freeze and wasting CPU

The stage set-data effect fires once per display-slice identity change
(`Stage.tsx:301-304`) with no debounce or coalescing, and each firing does a full
`disposeGraph()` + `new D3ForceSolver(...)` + prewarm (`threeField.ts:1083-1215`). A
view-mode switch alone emits multiple store changes: the bridge calls
`clearWorkingSet()` synchronously (a first display-slice recompute over the still-old
corpus slice) then `setCorpus(mode)` (`graphViewModeBridge.ts:64-65`), which is
non-optimistic — `patchDashboardState` awaits the engine round-trip before the cache
flips (`dashboardState.ts:252-264,754`) — so the corpus swap arrives as a later,
separate delivery. Layered with a filter toggle or timeline scrub, several full O(N)
rebuilds land in quick succession, each capturing the previous rebuild's mid-flight
positions and re-pinning them, so the layout never gets one clean uninterrupted
settle.

### timeline-scrub-plain-setdata-no-cold-hint | medium | Time-travel scrubs push bare set-data with no reflow and no cold-reset signal, riding the id-overlap warm path into the mid-settle freeze

`sceneTarget.pushSlice` issues `set-data` with no `reflow` and no cold hint
(`timeTravel.ts:114-122`). Consecutive historical instants share most ids, so they
classify warm; a 60fps local replay (`scrubTo → replayTo`,
`timeTravel.ts:150-153,207-209`) delivers a stream of warm reflows, any of which can
pin the previous instant's still-relaxing nodes. The return-to-live transition then
hands back to the stage live effect (`timeTravel.ts:229-235`), delivering a further
overlapping-id set-data that can also land mid-settle.

### corpus-cold-path-relies-on-incidental-id-disjointness | medium | The vault↔code cold re-explode is not signaled; it is an emergent side effect of id-overlap arithmetic, with no explicit cold/reset flag on the seam

`graphViewModeBridge.ts:18-22` claims the corpus switch takes the cold path "because
the two corpora share NO node id." True today — vault ids (`doc:{stem}`,
`rule:{slug}`) and code ids are disjoint namespaces — but the correctness is
incidental: the seam has a `reflow` flag (`sceneController.ts:228-239`) yet no
explicit cold/reset flag, so a corpus switch cannot TELL the scene to reset; it relies
on the overlap heuristic crossing the 0.5 boundary. Any future id-space overlap would
silently classify warm and under-settle the many new nodes at the low warm alpha —
the exact failure the half-carried gate's own comment warns about
(`threeField.ts:1158-1160`). The codebase-graphing D7 "wipe + reload" contract should
be an explicit command flag, not id arithmetic.

### empty-interim-setdata-wipes-graph | low | A transient empty slice is swapped in and blanks the scene via the n===0 early return

When the engine returns an empty node set, the display slice is a non-null empty
`{nodes:[],edges:[]}` (`displaySlice.ts:77-80`), so the stage guard does not skip it
(`Stage.tsx:302`); `setData` runs `disposeGraph()` then early-returns at `n === 0`
(`threeField.ts:1083-1094`), wiping the graph before the real data arrives as a cold
rebuild. This is the already-tracked GIR-008 "empty set-data ghost state," noted here
because it widens the rapid-swap window; it produces blank-then-reload, not the
frozen-tense symptom.

### refuted-hypotheses | low | Plausible causes traced and ruled out, recorded so future work does not re-chase them

Tick throttling: none exists — the driver runs exactly one `solver.tick()` per rAF
while `running` (`threeField.ts:1875-1918`); `updatePerfLod` throttles only render
quality, never tick rate; the perceived "aggressive throttle" is the pin-freeze.
Hidden/paused reheat loss: a `display:none` host still ticks the solver and only skips
the GPU render (`threeField.ts:1904-1916`); a backgrounded tab defers rAF but the
stored alpha is not discharged. `alphaTarget` leak: every energy path resets
`alphaTarget(0)`; `clearDrag` and the GIR-004 hand-off guard release drag holds
(`d3ForceSolver.ts:675,694,657`). Stale `localMode`: every `set-data` constructs a
fresh solver with `localMode` false (`threeField.ts:1128`, `d3ForceSolver.ts:206`).
`keepPreviousData` double-delivery: a key change returns the previous query's SAME
data object, so the memoized display slice does not change reference and the stage
effect does not re-fire with old-as-placeholder — the real double-delivery is the
`clearWorkingSet` + non-optimistic corpus flip sequence. Legend-mask reveal: hidden
nodes stay settled in place via `set-visibility` and re-reveal at unchanged positions
(`Stage.tsx:340-346`); reflow-mode re-adds re-enter as genuinely-new nodes. Error
tiers: a pending or errored query returns `data: undefined` and the stage guard skips
the push — no empty set-data from transport failure.

## Recommendations

The three review passes triangulate to ONE root cause: the pin-authoritative warm
path (`prewarmReflow`) is applied on evidence (node-id overlap) that cannot establish
its own precondition (survivors at rest in a still-valid arrangement), and the force
sliders are the only ambient path that performs the global unpin + re-solve
(`setParams → reheatGentle → wakeAllFree`) which that precondition failure requires —
hence the manual-wiggle workaround. Remediation, ordered:

- **Gate the warm pin path on prior settle state (closes the critical).** Capture the
  outgoing solver's `isSettled()`/`running` before `disposeGraph()` in
  `threeField.setData`; when the prior layout was NOT settled, a same-/overlapping-id
  update must continue relaxing carried nodes (seed positions, leave survivors awake
  at low energy, keep `running = true`) instead of pinning them and reporting settled.
  This alone closes the filter, code-corpus re-key, and timeline triggers.
- **Make the warm/cold decision topology-aware.** Detect an edge-set change under a
  constant node id set (the `relations` facet, timeline as-of slices) and treat it as
  a genuine force-field change: gentle global reheat over the reseeded positions, or
  feed changed-endpoint nodes to the movable set. The "same-id-set ticks zero"
  invariant should be scoped to same-ids-AND-same-edges.
- **Apply change-proportionality to the swap path.** Scale the reflow alpha (or tick
  budget) with the new-node fraction instead of the fixed warm 0.3, mirroring the
  `forceChangeFraction` principle the slider path already uses, so a many-new/few-
  carried swap cannot exhaust alpha before link/charge positioning completes. Restore
  the half-carried gate (or the proportional alpha) on the reflow branch.
- **Set a settled-floor alpha on the `movable === 0` early return** in
  `prewarmReflow` so a fresh solver never sits at alpha 1 and the next
  `reheatGentle` stays gentle instead of exploding.
- **Make the corpus switch an explicit cold reset.** Add a `reset`/`cold` flag to the
  `set-data` command; the view-mode bridge sets it on a corpus swap (and the timeline
  return-to-live hand-off uses the same classification), retiring the incidental
  id-disjointness dependency. This is a deliberate `SceneController` contract event
  per the architecture rule, to be reviewed as such.
- **Coalesce rapid deliveries.** Collapse the `clearWorkingSet` + non-optimistic
  corpus flip + filter/timeline burst to the final intended slice before a full solver
  rebuild; at minimum skip the rebuild when the incoming node/edge id-set is identical
  to the current one and the layout is already settled. Fix the code-corpus query key
  to drop the ignored `filter` component so filter toggles stop re-fetching an
  identical code slice.
- **Close the guard gap.** Add adversarial settle-probe tests: (1) set-data with an
  overlapping id-set over a NOT-yet-settled layout must leave `running === true`,
  never `isSettled()` over unconverged positions; (2) same-node-id/different-edge
  swap must re-relax; (3) few-carried/many-new reflow must end with bounded residual
  per-node speed and no collide overlap at freeze; (4) the `movable === 0` fresh-
  solver alpha floor. Fix guard (c)'s test-vs-production divergence (it pre-runs
  `prewarm()` where production has a fresh instance).
- **Honor `frozen` across `set-data`** (low): guard the swap-triggered resume on the
  user freeze so background deltas cannot un-freeze the sim.

Fixing the first four items keeps the Option B model intact — this audit does NOT
fire the ADR's Option-A re-open trigger, because the defects are precondition
violations of the pin discipline, not at-rest displacement or contact micro-buzz
recurring after the valve closures.

### Remediation (2026-07-03)

Landed in one fix commit, full frontend gate green (2524 tests, eslint + prettier +
tsc + px/token/figma checks exit 0):

- A new pure classifier (`swapClassifier.ts`, consumed by `threeField.setData`)
  enforces both warm-pin preconditions: survivors pin only over a SETTLED prior
  layout (a mid-settle swap continues the relax globally, seeded and unpinned, at the
  hotter of the carried temperature and the proportional alpha — closes
  `mid-settle-freeze-escalation` / `survivor-mispin-on-interrupted-settle` /
  `compounding-pins-across-successive-swaps` and subsumes `no-settle-watchdog`), and
  changed-edge endpoints join the movable set (closes `edge-only-change-zero-ticks`
  on the relations facet, timeline as-of, and live edge deltas).
- The warm relax alpha ramps with the movable fraction from `warmStartAlpha` toward
  `coldAlpha` (closes `fixed-warm-alpha-premature-freeze` and
  `warm-reflow-pins-stale-survivors` — the reflow `carried > 0` gate stays, but a
  few-carried/many-new reflow now relaxes at near-cold energy).
- `prewarmReflow`'s `movable === 0` return clamps a fresh solver's alpha to the
  settled floor (closes `stale-alpha-one-after-same-id-reflow`).
- The `set-data` seam gained the additive explicit `reset` cold flag; the stage
  stamps it on a corpus identity change and skips pushing the `keepPreviousData`
  placeholder window's old-corpus slice (closes
  `corpus-cold-path-relies-on-incidental-id-disjointness`; reviewed as a deliberate
  `SceneController` contract event in this fix's review cycle).
- The code-corpus graph query identity pins engine-ignored fields (filter, lens,
  as-of, focus) to canonical defaults, removing the byte-identical re-fetches that
  supplied most interrupting deliveries (the surgical half of
  `no-coalescing-rapid-setdata`; a general delivery debounce was deliberately NOT
  added — with settle-state gating the remaining burst cost is redundant work, not a
  correctness defect, and a debounce would add latency to every legitimate swap).
- A frozen sim now preps swap energy with zero ticks and never resumes from
  `set-data`; unfreeze resumes the pending settle (closes
  `frozen-not-honored-across-set-data`).
- Guards: a `swapClassifier` suite (gates, edge-topology movables, proportional
  alpha, continuation, reset) plus settle-probe (e) for the fresh-solver alpha
  floor, and a code-corpus identity test (closes
  `guard-gap-no-adversarial-reflow-coverage` at the decision layer, where the
  defects lived).

Not addressed here: `empty-interim-setdata-wipes-graph` remains tracked as GIR-008
under the `graph-implementation-review` audit.
