---
tags:
  - '#adr'
  - '#graph-force-stability'
date: '2026-06-16'
modified: '2026-06-16'
related:
  - "[[2026-06-16-graph-force-stability-research]]"
  - "[[2026-06-15-dashboard-node-graph-stability-adr]]"
---

# graph-force-stability adr: incremental reheat, held-alphaTarget interaction, and Obsidian-grade drag-to-pin

## Context

The connectivity (Obsidian-like) node-graph canvas under `frontend/src/scene/field/` was rewritten in the `2026-06-15-dashboard-node-graph-stability` cycle from a graphology ForceAtlas2 worker to a main-thread d3-force driver (`forceLayout.ts`). That cycle landed green (plan 14/14) and dissolved the original eleven defects — the per-frame camera snap (D1/D5), the ungated per-frame recompute (D4), the NaN crash (D4/D6), the worker re-entry race (D2/D8), and pin-fighting (D7). The graph now settles and freezes at zero idle CPU instead of spinning forever.

The residual complaint, verified in `[[2026-06-16-graph-force-stability-research]]` (root causes R1–R7), is narrower but real: the layout **flickers/jumps on data churn and on control interaction**, is **hard to control** (knob changes cause visible re-settling rather than smooth adjustment), and lacks Obsidian's **interactive fidelity** (no node drag-to-pin, no neighbour-focus reheat, a collision radius decoupled from the salience-driven node sizes). The instability is no longer a 60fps breathing loop — it is **transient re-heats and re-inits** fired by upstream React effects and by the control surface, each re-running forces over the whole field from a non-trivial alpha (`forceLayout.ts:285–291`, `setParams` reheat to ≥0.3 at `forceLayout.ts:375`).

The dominant residual is R1: any real `set-data` delta — a live constellation keyframe or a working-set expansion, both producing a fresh `merged` identity (`Stage.tsx:302–346`) — runs `applyModelToLayers(true)` → a full `layout.init()` + `layout.start()` at warm/cold alpha (`fieldAssembly.ts:819–825`), even though the driver already ships `applyChanges()` for exactly the incremental case (`forceLayout.ts:406–451`) and the assembly never calls it on this path. R2 is the control-side mirror: the layout-tune sliders dispatch `set-layout-params` on every `onChange`, each kicking the sim back to 0.3.

This ADR **extends** the prior `[[2026-06-15-dashboard-node-graph-stability-adr]]` (D1–D10) without contradicting it. It keeps that ADR's fixed-cooling contract (D3, codify candidate `force-layout-cooling-is-fixed-never-exposed`), its render-gating-on-the-layout-clock contract (D4, candidate `scene-render-work-is-gated-on-the-layout-clock`), its fit-once-on-settle camera (D5), its solver-level pinning (D7), and its connectivity-only scope fence (D10). It is a stability-and-fidelity follow-on, not a re-architecture: the solver, the seam, the cooling schedule, and the knob set all stand; the changes are in *when* the field reheats, *how* interaction holds it warm, and *whether* a node can be grabbed.

## Decision

### D1 — The incremental-vs-reinit boundary: content deltas route through `applyChanges`, re-init is reserved for scope/mode swaps

A `set-data` command whose node/edge set differs from the prior model only by additions and removals (the live-keyframe and working-set-expansion case) is routed through a **node/edge diff → `FieldLayout.applyChanges()`** path, reheating to a *low* alpha (`INCREMENTAL_REHEAT_ALPHA ≈ 0.15`), preserving every surviving node's position. A genuine **scope/workspace swap** (the persistence-scope effect at `Stage.tsx:317–322`) and a **representation-mode change** (`set-representation-mode`) remain full `init()` + warm `start()` — they are a new mental map, not a perturbation of the current one.

The precise rule: on `set-data`, the assembly computes the symmetric difference between the incoming id set and the currently-laid-out id set. If the surviving (intersection) set is non-empty AND no scope/mode swap is in flight, it calls `applyChanges({ addNodeIds, removeNodeIds, addEdges, removeEdgeIds })` at the low reheat. Only when there is no prior laid-out set (first load), or the assembly's `cacheKey.scope` changed, or the representation mode changed, does it full-`init`. `applyChanges`'s reheat ceiling is lowered from `WARM_START_ALPHA` to `INCREMENTAL_REHEAT_ALPHA` (`forceLayout.ts:449`).

**Filter-driven slice changes** (the research's open boundary): a filter that only changes *visibility* of an unchanged node set stays on the existing `set-visibility` path (`fieldAssembly.ts:446–453`) and never touches the layout. A filter that changes the *served node set* is a content delta and routes through `applyChanges` exactly like an expansion. Filters are never re-inits.

*Rationale:* this is the single highest-leverage change (R1, the dominant flicker), enabled by code that already exists; the boundary is mechanical (intersection non-empty + no scope/mode swap), so a future agent does not judge "is this a new slice?" per call site. *Verdict: adopt.*

### D2 — Interaction-active alphaTarget hold lives in the driver as `beginInteraction()/endInteraction()`, and `set-layout-params` is coalesced

The driver gains a held-warmth seam: `beginInteraction()` sets `alphaTarget = INTERACTION_ALPHA_TARGET (≈0.1)` and starts the loop; `endInteraction()` clears `alphaTarget` back to `0` and lets the field re-cool to freeze. While interaction is active, `setParams()` updates the forces **without** the `Math.max(alpha, 0.3)` kick (`forceLayout.ts:375`) — the held target keeps the field gently warm, so a param change is applied continuously and the field reflows around it instead of lurching. `setParams` called *outside* an interaction keeps its current one-shot reheat.

The seam belongs in the **driver**, not the assembly, because it must serve both the slider-drag (D2) and the node-drag (D3) with one held-target mechanism, and the driver owns alpha. The assembly translates pointer/control lifecycle into `beginInteraction/endInteraction` calls.

On the control side, the layout-tune `apply()` fires `beginInteraction` on the slider's first `onChange`/`pointerdown`, coalesces the `set-layout-params` dispatches across the drag (the driver applies the latest params each tick under the held target — no per-`onChange` command storm), and fires `endInteraction` on `pointerup`/`change`/blur. A short trailing debounce on the final dispatch guards keyboard-driven slider steps.

*Rationale:* R2, "hard to control". A held `alphaTarget` (a floor the field breathes against) is the exact Obsidian mechanism; repeated one-shot `alpha()` kicks are the anti-pattern. Keeping the cooling constants untouched honors `force-layout-cooling-is-fixed-never-exposed` — `alphaTarget` is an interaction floor, not a cooling-schedule knob. *Verdict: adopt.*

### D3 — Drag-to-pin: pointer-down on a node body enters node-drag; empty canvas pans; the `PointerGestures` contract gains a node-grab branch

`PointerGestures` (`camera.ts:156–224`) gains a node-drag branch. On `pointerDown`, it hit-tests; if a node is hit, it records a *pending node-drag* on that id instead of arming a pan. On `pointerMove` past the existing `DRAG_THRESHOLD_PX` (4px): if a node was hit on down, it is a **node-drag** (emit the node's world position to the driver each move, which sets `fx/fy` and holds `alphaTarget` via `beginInteraction`); if empty canvas was hit, it is a **camera pan** exactly as today. On `pointerUp`: a node-drag below threshold is still a **select** (unchanged click semantics); a node-drag past threshold ends the drag, calls `endInteraction`, and **records a sticky pin** for that id (routed through the existing `set-pinned` / pins-store path, `fieldAssembly.ts:473–481`).

The `GestureCallbacks` interface (`camera.ts:145–149`) gains `nodeDragTo(id, worldX, worldY)` and `nodeDragEnd(id, moved)`. The assembly implements them against the driver (a new `dragNode(id, x, y)` that sets `fx/fy` and ensures `beginInteraction`) and the pins store. Double-click and context-menu are unaffected. Node-drag only diverges from pan *after* the 4px threshold is crossed with a node hit on down.

*Rationale:* R7, the headline missing interaction. The current comment claims "immediate drag-to-pin" (`forceLayout.ts:9`) but every pointer-down+move is a camera pan — drag-to-pin does not exist. Disambiguating on *what was under the pointer at down-time* is the standard Obsidian/force-graph rule and composes cleanly with the existing threshold and click/select machinery. Scene/view-layer only; no wire, no stores fetch. *Verdict: adopt.*

### D4 — `forceCollide` radius is per-node, sharing `nodeRadius()` via an assembly-owned radius callback

The fixed `COLLIDE_RADIUS = 18` (`forceLayout.ts:87,198`) is replaced by a per-node collision radius derived from the same salience function the sprite layer uses (`nodeRadius()`, `nodeSprites.ts:196–206`, range 6→15.6px) plus a small constant pad. The seam is a **`radiusOf(id): number` callback** passed into the driver at `init`/`applyChanges`, NOT a radius-map snapshot and NOT importing `nodeRadius` into the driver. The driver stays framework-free and render-agnostic by design; the **assembly** owns the callback (`radiusOf = (id) => nodeRadius(this.model.nodeById(id)) + COLLIDE_PAD`). When the callback is absent (tests, deterministic modes), the driver falls back to the current fixed radius.

*Rationale:* R4. A constant 18 holds large-salience neighbours 36 apart while they draw at ~15.6, and holds small nodes 36 apart while they draw at 6 — and the constant fights link distance (40), producing residual shuffle near the `MOVE_EPSILON=0.4` gate. A per-node radius that tracks the visual body removes that fight; the callback seam keeps the driver pure and respects the scene/field boundary. *Verdict: adopt.*

### D5 — Settle-freeze on a velocity/dwell threshold, with a node-count-scaled dwell, atop the alpha floor

The driver gains an **early freeze**: when the maximum per-node displacement stays below `FREEZE_MOVE_EPSILON` for `FREEZE_DWELL_TICKS` consecutive ticks, the sim stops and fires `onSettle` even if `alpha > alphaMin`. The dwell **scales with node count** to avoid freezing a large, slow-converging island prematurely: `FREEZE_DWELL_TICKS = clamp(round(nodeCount / K), DWELL_MIN, DWELL_MAX)`. The alpha-floor freeze (`forceLayout.ts:321–325`) remains the hard backstop. The dwell-counter resets on *any* node exceeding the move epsilon, so a far island still drifting under `distanceMax=500` clipping (R6) keeps the field warm until it too settles — the field cannot false-freeze while one island wanders, nor spin forever once all motion is sub-epsilon.

*Rationale:* R5/R6. The current `MOVE_EPSILON` gate suppresses *render*, not *simulation*, so the sim ticks sub-epsilon jitter until the alpha floor; one twitchy node un-gates the whole frame. Obsidian-grade renderers freeze the *sim* on a low-movement threshold; node-count-scaled dwell protects slow islands. *Verdict: adopt.*

### D6 — Collapse the double-init and double-fit on mount and mode entry

On mount, both the `set-data` effect and the `set-representation-mode: connectivity` effect fire, and the latter's connectivity branch also `init()`s + `start()`s (`fieldAssembly.ts:640–641`) — the field is initialised and reheated twice in one commit (R3). The fix: `set-representation-mode` is a **no-op when the requested mode is already the applied connectivity mode and the model is already laid out**; the `set-data` path is the single connectivity initializer on first load. The double camera fit (instant seed-fit at `fieldAssembly.ts:825` then animated settle-fit at `:219–224`) is collapsed: the instant seed-fit is dropped when an animated settle-fit will follow, retained only as a cheap one-shot framing when there is no prior camera state and no settle is expected (deterministic modes).

*Rationale:* R3. Two reheats and two camera moves per load read as a post-load "snap-settle"; both are removable without touching the solver. *Verdict: adopt.*

### D7 — Expose a freeze/unfreeze toggle; keep collision/separation/damping knobs internal; cooling stays fixed

The control surface gains one new affordance: a **freeze/unfreeze toggle** (Obsidian's pause), mapped to driver `stop()` and a low-alpha `start()`, emitting a scene command only. The **collision/separation** and **settle-damping** knobs (research C3) are **not** exposed this cycle — the per-node collision (D4) makes a manual collision knob largely redundant and a damping knob risks confusion with the fixed cooling schedule; they are deferred, not rejected. The cooling schedule stays fixed and unexposed per `force-layout-cooling-is-fixed-never-exposed`.

*Rationale:* the freeze toggle is the one knob with clear Obsidian-parity value and no overlap with the cooling contract; holding back the redundant knobs keeps the control surface honest (no dead controls). *Verdict: adopt-deferred (freeze toggle adopt; other knobs deferred).*

### D8 — Scope stays connectivity-only; drag-to-pin and freeze do NOT extend to deterministic modes this cycle

The prior ADR's D10 scope fence holds: every change here applies to **connectivity mode only**. Lineage and semantic remain deterministic seed layouts with the solver held stopped. Drag-to-pin (D3), the held-alphaTarget interaction (D2), incremental reheat (D1), and the freeze toggle (D7) presuppose a running solver. Node-drag on a deterministic mode would have no solver to reflow around; that is a separate, future decision.

*Rationale:* the parent ADR fenced scope to connectivity precisely because that is the unstable, solver-driven mode; extending interactive solver semantics to still modes would require deciding what a drag *means* with no live forces. *Verdict: adopt (fence held); deterministic-mode drag/freeze rejected this cycle.*

## Decision ledger

| Decision | Verdict | Note |
| --- | --- | --- |
| D1 — content delta → `applyChanges` (low reheat ~0.15); re-init only for scope/mode swap; filters never re-init | adopt | Highest-leverage flicker fix (R1); uses existing `applyChanges` |
| D2 — `beginInteraction/endInteraction` held alphaTarget (~0.1) in the driver; coalesce/debounce `set-layout-params` | adopt | R2; serves slider + node drag; cooling constants untouched |
| D3 — node-drag branch in `PointerGestures`; node-body drags+pins, empty canvas pans | adopt | R7 headline interaction; click/select/context unchanged |
| D4 — per-node `forceCollide` via assembly-owned `radiusOf(id)` callback sharing `nodeRadius()`+pad | adopt | R4; callback seam keeps driver render-agnostic |
| D5 — velocity/dwell early freeze (dwell scales with node count) atop the alpha-floor backstop | adopt | R5/R6; freezes the sim, not just the draw |
| D6 — collapse double-init (representation no-op when already-applied) and double-fit | adopt | R3; removes the post-load snap-settle |
| D7 — expose freeze/unfreeze toggle; collision/separation/damping knobs deferred; cooling fixed | adopt-deferred | One honest new knob |
| D8 — connectivity-only fence held; no drag/freeze on deterministic modes this cycle | adopt | Honors parent D10 |

## Consequences

**Gains.** The dominant residual flicker (R1) is removed: live keyframes and expansions perturb at alpha ~0.15 with positions preserved instead of re-settling from 0.5. Tuning becomes smooth (R2). The graph gains true Obsidian-grade drag-to-pin (R7). Collision tracks the visual body (R4). The sim freezes on motion, not just the alpha clock (R5). The post-load double-snap disappears (R3, R6). Idle CPU stays at zero.

**Difficulties.** `PointerGestures` grows a node-drag branch — its tests must cover node-hit-on-down vs empty-canvas-on-down and the still-a-select-below-threshold case. The `set-data` path grows a diff and a routing decision; a missed survivor would re-init and re-flicker (the exact failure being fixed). The prior 20 layout tests "never drive the live `onPositions` loop"; this cycle's verification must drive that live loop. Lowering `applyChanges`'s reheat constant changes the warm-start feel and must be re-baselined.

**Pathways opened.** The `beginInteraction/endInteraction` seam (D2) is the substrate for the deferred neighbour-focus reheat (C2). The `radiusOf` callback (D4) generalizes to any per-node force parameterization. The freeze toggle (D7) is the anchor for the deferred collision/damping knobs. The stable connectivity interaction model is what the deferred deterministic-mode drag (D8) would borrow.

## Alternatives considered

- **Keep full re-init and just lower the reheat alpha on `set-data`.** Rejected: re-init rebuilds the node array and re-runs link assignment, discarding the warm-start advantage; `applyChanges` does the in-place mutation d3 best practice calls for.
- **Put the interaction-active state in the assembly rather than the driver.** Rejected: `alphaTarget` is the driver's, and the same held-warmth must serve both slider-drag and node-drag; one driver seam (D2) is where both converge.
- **Hand the driver a per-node radius *map* snapshot at init.** Rejected for a `radiusOf` callback (D4): a snapshot goes stale when salience changes and forces the driver to hold render-derived state.
- **Modifier-key drag-to-pin (drag = pan, shift-drag = node).** Rejected: hit-at-down-time is discoverable and key-free; a modifier is a hidden affordance.
- **Expose collision/separation and damping knobs now.** Deferred (D7): per-node collision makes them largely redundant and damping risks confusion with the fixed cooling.
- **Extend drag/freeze to lineage/semantic modes.** Rejected this cycle (D8): those modes hold the solver stopped; a drag has no live field to reflow.

## Constraints & rule compliance

- **`graph-compute-is-cpu-gpu-is-render-and-search`:** all changes are CPU-side layout (the d3-force driver) and scene rendering; no graph compute moves to the GPU.
- **`graph-queries-are-bounded-by-default`:** no change to what is fetched/served; incremental reheat (D1) operates on the already-bounded slice; drag/freeze are pure scene interactions.
- **`dashboard-layer-ownership`:** every change lives in `frontend/src/scene/` (driver, gestures, assembly) and `frontend/src/app/stage/` chrome emitting `SceneController.command()` only — no engine code, no wire surface, no stores fetch.
- **`force-layout-cooling-is-fixed-never-exposed` (prior candidate):** honored; `alphaDecay`/`velocityDecay`/`alphaMin` stay fixed; `alphaTarget` (D2) is an interaction floor; the velocity-freeze (D5) is a settle *detector*.
- **`scene-render-work-is-gated-on-the-layout-clock` (prior candidate):** reinforced; the early freeze (D5) ceases per-frame work sooner; D6 removes a redundant camera fit; auto-fit stays one-shot.
- **Prior ADR D7 (solver-level pinning):** drag-to-pin (D3) sets `fx/fy` in the simulation (the existing `setPinned` mechanism) and routes sticky pins through `set-pinned` — no display-overwrite reintroduced.

## Open questions deferred to the plan

- Exact constants: `INCREMENTAL_REHEAT_ALPHA` (~0.15), `INTERACTION_ALPHA_TARGET` (~0.1), `FREEZE_MOVE_EPSILON`, `FREEZE_DWELL_TICKS` bounds, the `K` divisor — tune empirically against 12-, ~50-, ~300-node slices in the live loop.
- Diff source for D1: assembly computes the add/remove diff against `this.model` before `model.setData`, or `LinkageModel` exposes a diff helper — and interaction with the existing `dataSignature` skip and the `apply-deltas` fast path.
- Drag debounce/coalesce mechanics: `GraphControls` rAF-batched dispatch vs `SceneController`/assembly latest-wins per tick; trailing-debounce window for keyboard slider steps.
- Node-drag hit precision: same `HIT_RADIUS_WORLD=10` as select? behaviour of a drag that starts on a node then moves onto empty canvas.
- `applyChanges` reheat constant change: re-baseline any test asserting the current warm reheat.
- Test strategy for the live loop (the noted under-tested surface).
- Codify follow-ups: whether the incremental-vs-reinit boundary (D1) and the held-alphaTarget seam (D2) become codify candidates after holding across this cycle.

## Sources

- `[[2026-06-16-graph-force-stability-research]]` — root causes R1–R7, recommendations S1–S5/C1–C3, Obsidian/d3-force reference model.
- `[[2026-06-15-dashboard-node-graph-stability-adr]]` — the prior ADR this extends (D1–D10; codify candidates `scene-render-work-is-gated-on-the-layout-clock`, `force-layout-cooling-is-fixed-never-exposed`).
- Code: `forceLayout.ts` (cooling 73–75, reheat alphas 77–80, forces 230–238, fixed collide 87/198, frame loop+freeze 303–327, `setParams` 372–380, `setPinned` 387–403, `applyChanges` 406–451, `start` 285–291); `fieldAssembly.ts` (`dataSignature` 413–414, `apply-deltas` 421–444, `set-visibility` 446–453, `set-pinned` 473–481, settle-fit 219–224, `applyModelToLayers` 753–826); `camera.ts` (`GestureCallbacks` 145–149, `PointerGestures` 156–224, `DRAG_THRESHOLD_PX=4`, `HIT_RADIUS_WORLD=10`); `nodeSprites.ts` (`nodeRadius()` 196–206); `app/stage/GraphControls.tsx` (tune `apply()` per-onChange dispatch); `app/stage/Stage.tsx` (`merged` 302–312, effects 317–358).
- Rules: `graph-compute-is-cpu-gpu-is-render-and-search`, `dashboard-layer-ownership`, `graph-queries-are-bounded-by-default`.
