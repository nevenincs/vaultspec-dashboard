---
tags:
  - '#adr'
  - '#graph-simulation-stability'
date: '2026-06-29'
modified: '2026-07-03'
related:
  - "[[2026-06-29-graph-simulation-stability-research]]"
  - '[[2026-07-03-graph-simulation-stability-research]]'
---
# `graph-simulation-stability` adr: `the settled layout is authoritative: additive set-data pins survivors and relaxes only new nodes` | (**status:** `accepted`)

## Problem Statement

The headline node-graph reshapes itself when the user expects it to be still. A settled
layout is frozen, not converged (the force solver pins every node at `alphaMin` rather than
reaching equilibrium), so it stores residual tension. Any additive `set-data` — opening or
expanding a node materializes its ego network, a live delta, or a same-scope re-fetch —
re-runs the WHOLE solver: the warm-start path calls `prewarm`, which `wakeAllFree()`s
(unpins every node) and ticks, releasing the stored tension so the entire existing layout
drifts to a new configuration. The user's requirement is explicit: the graph must be
**static unless a node is explicitly dragged**; selecting, highlighting, flaring, and
focusing must be pure visual + camera operations that never move a node. The research
(grounded in the live path and the d3-force docs) found selection/highlight is already
decoupled at the field level, so the single load-bearing defect is that an additive
`set-data` re-simulates settled nodes.

## Considerations

- The fix pattern already exists in `D3ForceSolver.prewarmReflow`, wired only to the FILTER
  reflow path: it pins every carried survivor at its current position and relaxes ONLY
  genuinely-new nodes, and does ZERO ticks when nothing is new. The plain warm-start path
  (`prewarm`) does not pin survivors — that is the gap.
- The "make the rest state a true fixed point by alpha-annealing `forceCollide`" idea was
  considered and REJECTED: d3-force is a simulated annealer, not a minimizer. It cools on a
  fixed ~300-tick schedule (`alpha += (alphaTarget − alpha) × alphaDecay`, `alphaMin 0.001`)
  regardless of force balance, so collide-annealing only removes residual jitter as alpha
  decays — it cannot produce a stable equilibrium. Chasing a fixed point inside d3-force is
  structurally unsound (research F4), and the user independently doubted it.
- Obsidian (whose model is d3-force's) does NOT pin or seek a fixed point — it keeps the sim
  warm (the "jiggle") and lives with drift. There is no Obsidian alpha trick to copy; our
  pin-on-settle is already more static. The requirement is a position-authority decision,
  not a force-tuning one (research F5/F6).
- The renderer is render-on-demand and the selection/highlight/flare/focus paths and the
  drag path are already correct; they must be preserved untouched.

## Constraints

- Must consume the existing `SceneController` command contract and the `D3ForceSolver`
  surface UNCHANGED beyond the warm-start dispatch (the scene contract is preserved per the
  view-rewrite / layer-ownership rules; this is a field-internal behaviour change, not a new
  wire datum).
- `forceCollide` must still resolve new-vs-survivor overlap with survivors held fixed — d3
  keeps pinned (`fx`/`fy`) nodes in the quadtree as fixed obstacles, so a new node settles
  into the gaps without displacing a pinned survivor. This is relied upon, not added.
- The warm-vs-cold GATE is retained as-is: cold (full energy + one-time camera fit) only for
  a (near-)disjoint id set (first load, scope/lens switch); warm otherwise. The research
  comment warns that a low-overlap change must NOT warm into an unsettled off-screen clump
  with no refit, so the existing `carried >= 0.5 × n` (data update) / `carried > 0` (filter
  reflow) thresholds stay. Only the prewarm dispatch inside the warm branch changes.
- No engine change; `vaultspec` stays read-and-infer. No new px, no token drift, no scene
  layer-boundary crossing.

## Implementation

A single, contained behaviour change in the three.js field's `setData`: collapse the
`warm && reflow` special-case so that EVERY warm path (additive data update, filter reflow,
live-delta-driven re-set-data) pins carried survivors and relaxes only genuinely-new nodes
via the existing `prewarmReflow(isNew = id not carried, WARM_START_ALPHA)`. The cold path
(disjoint corpus) keeps the full `prewarm` plus the one-time `fitToView`. The warm-vs-cold
gate is unchanged.

Consequences that fall out for free from `prewarmReflow`'s existing semantics: a `set-data`
whose id set is unchanged (a content-only re-fetch / a delta that only removed nodes) has
zero new nodes, so it does ZERO ticks and moves nothing; an ego expansion relaxes only the
new ego nodes around their pinned hub; a live delta adds its nodes without disturbing the
settled graph. Survivors end pinned-and-asleep, consistent with the existing
`asleep ⇔ pinned` invariant, so a later drag/reheat (which `wakeAllFree`s) is unaffected.

The collide-annealing follow-up is dropped (recorded as rejected above), and wiring the
existing-but-unused `positionCache` into the field (cross-reload position persistence) is
deferred as a separate enhancement — not required to fix the reported symptom.

## Rationale

The requirement is about position AUTHORITY: once a layout settles, its positions are the
truth and must not be recomputed for an additive change. Pinning survivors (research F6) is
the direct, minimal expression of that, and it reuses a discipline already proven on the
filter path rather than inventing a mechanism. Rejecting collide-annealing is grounded in
the d3-force model (research F4): annealing cannot yield a fixed point, so it would not
satisfy "static unless dragged" and would add risk for no benefit. Keeping the cold gate
honors the existing warm-start review lesson (a partial-overlap change must not warm into an
off-screen clump). The change leaves the already-correct selection/highlight/flare/focus and
drag paths untouched, so it targets exactly the one defect the research isolated.

## Consequences

- **Gain:** opening/expanding a node, a live delta, and a same-scope re-fetch no longer
  reshape the settled graph; nodes move only when dragged or when they are genuinely new.
  The reported symptom is removed at its source.
- **Gain:** zero added complexity — the change is a dispatch unification onto an
  already-tested path; no new force, no new state, no new wire datum.
- **Honest difficulty:** an ego expansion that adds many new nodes around a small pinned
  cluster relaxes only the new nodes against fixed survivors; if the survivors were laid out
  tightly, the new nodes may pack into the available gaps rather than the whole cluster
  "breathing" to accommodate them. This is the deliberate trade the requirement asks for
  (survivors stay put); a future bounded one-hop relax neighbourhood could soften it if the
  packing ever reads poorly, but is intentionally out of scope here.
- **Preserved:** the cold path still re-explodes + refits a genuinely new corpus (scope/lens
  switch / first load), which is correct — there is no prior layout to preserve there.
- **Pitfall watched in review:** the warm gate threshold means a small base graph receiving
  a large expansion can still take the cold (reshaping) path; verification must confirm the
  common case (large graph, small expansion) is warm and static.

## Codification candidates

- **Rule slug:** `settled-layout-is-authoritative-additive-data-pins-survivors`.
  **Rule:** A graph `set-data` that carries existing nodes over (an ego expansion, a live
  delta, a re-fetch) must pin the carried survivors and relax ONLY genuinely-new nodes, and
  must do zero solver ticks when no node is new — the settled layout is authoritative and a
  node never moves except by an explicit drag or as a genuinely-new node; the force
  simulation is never re-run over already-settled nodes, and convergence is never chased
  inside the annealing solver. (Promote only after this holds across a full cycle.)
