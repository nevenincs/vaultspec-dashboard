---
tags:
  - '#adr'
  - '#graph-representation'
date: '2026-07-03'
modified: '2026-07-03'
related:
  - "[[2026-06-14-graph-representation-research]]"
  - "[[2026-06-14-graph-representation-adr]]"
  - "[[2026-07-02-global-state-review-audit]]"
  - "[[2026-06-16-figma-parity-reconciliation-adr]]"
---

# `graph-representation` adr: `graph emphasis-state grammar and cluster-selection fence` | (**status:** `accepted`)

## Problem Statement

Users reported that three distinct graph interactions look the same. Hovering a node highlights its cohort, selecting a feature item spotlights that feature's cluster, and selecting a node emphasises it — yet on screen a durable feature-cluster selection is indistinguishable from a transient hover, and neither reads as clearly different from a node selection. The confusion is not cosmetic drift; it traces to the fact that the emphasis grammar was never written down, only implicit in shader constants. Diagnosing the fix therefore required first reconstructing the actually-implemented state model. This ADR records that reconstruction as the authoritative model and then decides the differentiation.

The verified as-is model has two fully-fenced planes. The EMPHASIS plane (recede/highlight, nothing removed) is resolved by a single function, `emphasisSet()` in `frontend/src/scene/three/threeField.ts`, which selects exactly one active cohort by fixed precedence: hover (transient, view-local, sourced only from the canvas pointer pick `hoveredId`, emitted outward only to feed the DOM hover card via `frontend/src/stores/view/selection.ts`), then feature-cluster spotlight (durable, backend-canonical: selecting a feature writes `selected_ids=[feature:<tag>]` into dashboard-state, routed by `projectDashboardSelectionToScene` to the `set-feature-spotlight` command in `frontend/src/scene/sceneController.ts`, which stores the tag and re-derives its member cohort from `featureCohort` on every set-data), then node selection (backend-canonical `selected_ids`, cohort of selected node plus direct neighbours, ringed by a wide accent ring in the 2D overlay pass `drawLabels`). A fourth branch, `set-meta-highlight` / `metaHighlightIds`, remains in the command union and field state but has no live sender anywhere in app or stores — it is dead. Two ring-only decorations sit outside the resolver: pulse (transient flash on a timeline event-click) and pinned (thin dashed ring). The FILTER plane (`dashboardState.filters`, engine-applied in `/graph/query` plus client `computeVisibility` → `set-visibility` → the `aHidden` attribute) removes nodes entirely and is healthy and untouched here.

The root causes of the confusion, confirmed in source: the spotlight and the hover cohort resolve to the identical binary treatment — cohort keeps full category colour, everyone else mixes 30% toward the canvas background (`NODE_RECEDE_MIX = 0.3`, node fragment shader gated on `vDim > 0.5`), so a durable selection and a transient hover are visually the same; there is no positive cluster-level marker at all, the spotlight being expressed only through what it dims; the recede is binary and instant, `aDim` flipped 0/1 in one frame by `applyEmphasis()` with no tween, producing a clunky pop between states; and the dormant meta-highlight makes it appear that two feature-highlight mechanisms exist when only one is live.

## Considerations

The fix must differentiate three interaction states that share one resolver and one precedence order, without breaking the plane fence to filtering, without any wire, store, or engine change, and while honouring prior accepted decisions. Differentiation by hue is precluded by the `figma-parity-reconciliation` decision (category colour is identity-bearing and must be preserved). Differentiation must therefore come from grammar — ring, fence, recede depth, and motion — layered onto the existing treatments. The cluster-selection marker must be one calm, unambiguous boundary suited to a single selected set, must track a live-relaxing layout every frame, must re-theme correctly, and must respect the established rule that rings and anchors gate on the visible-node mask.

## Considered options

- **Differentiate by hue/tint per state.** Rejected: violates `figma-parity-reconciliation`, where category colour carries node identity and must not be repurposed; would also collide with the theme ramps.
- **BubbleSets concave hull for the selected cluster (the recorded v1 direction).** Rejected for cluster-*selection*: BubbleSets' concave, implicit-contour energy field earns its cost for dense overlapping ambient membership sets, not for a single selected cohort that needs one legible calm boundary; its concavity reads as noisy and its per-frame implicit-field cost is unjustified here.
- **Convex padded hull (rounded n-gon) for the selected cluster.** Chosen: Andrew monotone-chain over the cohort's positions then a Minkowski disc offset yields a rounded n-gon that is never concave by construction, is O(k log k) over a bounded cohort, and draws as one unambiguous perimeter.
- **Keep dimming-only, deepen recede without a fence.** Rejected: still gives the cluster no positive marker and leaves durable selection weak relative to node selection.
- **Ring the whole cluster like a node.** Rejected: a ring reads as a singleton focus; a cluster needs a boundary enclosing many nodes, and reusing the node ring would re-conflate node and cluster selection.
- **Keep the instant binary recede.** Rejected: the pop between states is itself part of the reported clunkiness; a continuous eased `aDim` is required.
- **Leave `set-meta-highlight` in place as latent capability.** Rejected: no live sender exists, it fabricates the appearance of a second feature-highlight mechanism, and the project convention forbids dormant deprecation bridges.

## Constraints

- Scene-only work: no wire change, no new store state, no engine change. The single contract event is the end-to-end deletion of the `set-meta-highlight` command union member, recorded here as a deliberate `SceneController` contract event per the view-rewrite rule.
- Design-system rules bind: colours only via semantic tokens read at the scene boundary through `getComputedStyle` as literal hex per theme (re-derived on the theme-epoch cache so the fence re-themes), no ad-hoc hexes; overlay sizes routed through the uiScale bridge (rootFontPx/16); motion follows the existing grammar (~180–220 ms) and respects prefers-reduced-motion with an instant swap; the fence draws on the existing 2D overlay canvas, never a new WebGL pass.
- Resource bounds hold trivially: the hull runs over the bounded cohort (≤ `MAX_DOCUMENT_NODES`) at O(k log k) per frame, and the dim tween reuses the already-allocated per-node Float32 attribute — no new accumulator.
- CPU-compute rule: hull math is CPU-bound in the render layer; the GPU stays render-only.
- The emphasis precedence order (hover > spotlight > node selection) is retained unchanged; only the visual treatments differentiate.
- Parent-decision stability: this amends only the cluster-*selection* slice of the accepted `graph-representation` (2026-06-14) overlay direction; the ambient membership-overlay family it decided remains unimplemented and unaffected, so no unstable parent feature is depended upon.

## Implementation

The decision is a state grammar that differentiates by grammar, not hue. Hover renders as recede only (soft, shallow ~0.3 mix). Node selection renders as accent ring plus recede. Cluster (feature) selection renders as a perimeter fence plus a deeper recede (~0.5 mix), so a durable selection reads as the stronger state and outranks hover's shallow recede. The filter plane is unchanged.

The fence geometry is the convex hull of the cohort's node positions — Andrew monotone-chain over `cpuPositions`, trivial at bounded node counts — followed by a Minkowski offset by a pad radius. Offsetting a convex hull by a disc natively produces a rounded n-gon: straight edges push outward, vertices become arcs at the pad radius. It is never concave by construction. It draws on the existing 2D overlay canvas in the same pass as rings and labels (`drawLabels`), an accent-token stroke over a very-low-alpha fill, re-read per frame so it tracks the live layout and re-themes correctly. The fence gates on the visible-node mask exactly as rings and anchors do: a filtered-out member contributes no hull point, and an all-hidden cohort draws no fence.

Transitions become continuous. `aDim` moves from a 0/1 flip to a continuous 0..1 with per-node targets eased in the render loop over the existing ~180–220 ms motion window; the node fragment shader changes from the binary `vDim > 0.5` threshold to a continuous `mix(vColor, uDimColor, vDim * recede)`; glyph alpha eases on the same curve; and the fence's stroke and fill alpha ramp with the same easing. Every emphasis-state change cross-fades rather than pops. All of this is gated on prefers-reduced-motion, which reverts to an instant swap.

Cleanup deletes `set-meta-highlight` end to end: the command-union member in `frontend/src/scene/sceneController.ts`, the `metaHighlightIds` field state and its `emphasisSet()` branch in `frontend/src/scene/three/threeField.ts`, and the clear-on-set-data line — a full cutover with no alias or bridge.

This ADR reconciles explicitly with three prior decisions. It amends the v1 cluster-overlay choice of the accepted `graph-representation` ADR (2026-06-14) for the cluster-selection case only: the selected cluster's fence is a convex padded hull, never a concave BubbleSets contour, because selection needs one calm unambiguous boundary; BubbleSets and the deferred KelpFusion remain the recorded direction solely for a future ambient multi-set membership overlay, should one ever be promoted. It keeps everything in the `figma-parity-reconciliation` ADR (2026-06-16) — category-coloured circles, gentle recede, thin accent focus ring, no glow, no near-black, and edges that never fade (edges keep gradient colour and confidence width in every mode) — changing only the recede depth for the durable selection states, adding the fence, and animating the transition. It follows the `global-state-review` audit (2026-07-02, GS-004) precedent that rings and anchors gate on the visible-node mask, applying the same gate to the fence.

## Rationale

Hue is spoken for by node identity, so the only headroom for differentiation is grammar. Assigning each state a distinct grammar — recede-only for the transient hover, ring for the singleton selection, enclosing fence plus deeper recede for the durable cluster selection — makes the three states separable at a glance and gives the durable cluster selection the positive marker it entirely lacked. The convex padded hull wins over BubbleSets for a single selected set on three counts a future reader needs: it cannot go concave, so the boundary is always calm; its per-frame cost is a bounded O(k log k) chain rather than an implicit-field solve; and one selected cohort has no overlapping-set ambiguity for BubbleSets' concavity to resolve. Making `aDim` continuous removes the pop that was itself part of the reported clunkiness and does so by reusing an already-allocated attribute, so the motion improvement carries no new resource cost. Deleting the dead meta-highlight is required by the no-deprecation-bridges convention and removes the false appearance of two feature-highlight mechanisms.

## Consequences

Gains: the three interaction states become distinguishable at a glance; durable cluster selection gains a positive marker instead of being inferred from what it dims; state changes cross-fade rather than pop; one dead command leaves the surface; and the emphasis grammar is now written down in this ADR rather than living implicitly in shader constants.

Costs and risks: the shader threshold change touches every node's rendered colour path and needs visual-regression care across all three themes; the per-frame hull redraw joins the overlay budget, and since the overlay pass is already the FPS-sensitive path, the existing perf-degraded LOD flag should skip the fence fill under degradation; the deeper ~0.5 recede must have its contrast re-verified in all three themes; and the union deletion is a breaking `SceneController` contract event for any out-of-tree consumer, of which none are known.

Opens: the fence primitive is the natural future host for the ambient BubbleSets or GMap membership overlays if that direction is ever promoted, and the continuous `aDim` channel enables future partial-emphasis treatments such as a distance-graded recede.
