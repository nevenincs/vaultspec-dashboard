---
name: display-state-is-backend-served-not-frontend-derived
---

# Displayed/filterable state is backend-served, never frontend-derived

## Rule

Any value the dashboard DISPLAYS or FILTERS by — a status, a category, a
completion state, a count, a label-driving classification — must be SERVED by the
engine on the wire, not computed/derived in the frontend. If a surface needs a
derived classification (e.g. a plan's completion, a node's category, a
degradation state), the derivation lives in the engine projection and the engine
serves the result; the `frontend/src/stores/` layer reads it and the view renders
it. A frontend that recomputes a value the backend should own is a defect, even
when the inputs happen to be on the wire. This is sharpest when the served slice is
BOUNDED: a count, rollup, or percentage must be computed and served by the engine
over the FULL set PRE-TRUNCATION — never re-counted in the frontend over a
node-capped / paginated slice, which silently UNDERCOUNTS the moment the slice
truncates (the `graph-queries-are-bounded-by-default` / `MAX_PLAN_INTERIOR_NODES`
ceilings make this a live hazard, not a hypothetical).

## Why

Standardized behaviour requires ONE source of truth for every displayed fact, and
the engine is read-and-infer (the inference belongs there). The
`2026-06-22-filtering-reconciliation` cycle hit the failure mode head-on: the
"Plan status" filter was built to key off `lifecycle.state`, but a plan's
`lifecycle.state` is its TIER (`L1`..) while completion lives in
`progress` (done/total) — so deriving "in progress / finished" anywhere but the
engine produced a polluted facet that unioned tiers, ADR statuses, and audit
severities into the Plan-status control (caught only by a live screenshot, not by
tests). The fix made the engine derive + serve `plan_states`
(not-started/in-progress/finished) from progress, plan-scoped; the frontend just
renders it. The user directive was explicit: "if every other information is
derived or not served by the backend, the frontend should never derive
information." This is the consumer-side companion of `engine-read-and-infer`
(the engine OWNS inference) and `dashboard-layer-ownership` (stores is the sole
wire client): together they keep one classification authority per fact.

## How

- **Good:** a new filterable/displayable classification (plan completion, a
  category, a health condition, a status) is computed in `engine-query` and
  enumerated in the served `/filters` vocabulary; the frontend threads the wire
  field through the stores types and renders it, mapping only PRESENTATION (a
  plain label, a dot tone) — never the value itself.
- **Good:** a label is presentation and stays frontend-owned (the engine emits
  raw `doc_type`/`status` tokens; the frontend maps them to user words through one
  centralized map). Mapping a served token to a word is not "deriving state."
- **Good:** a plan's wave/phase/step counts, per-container rollups, and derived
  completion state are computed in the engine's plan-interior projection over the
  FULL tree (pre-truncation, via the descent's true-total budget) and served on the
  `plan-interior` response; the reader's summary card and the right-rail step tree
  render those served values, and the display percentage is presentation math over
  the served `done_count`/`step_count`.
- **Bad:** the frontend computing a plan's in-progress/finished from `done/total`,
  classifying a node's category from heuristics, or inferring "offline" from a
  transport error — each re-derives a fact the backend should own, drifts from the
  engine, and (as the plan-state bug showed) silently goes wrong while tests pass.
- **Bad:** re-counting per-wave/phase rollups in the stores layer over the SERVED
  plan-interior tree (`rollupSteps`/`sumRollups` over `interior.steps`) — correct
  until the interior hits `MAX_PLAN_INTERIOR_NODES`, then it undercounts every
  rollup and percentage with no error. The counts must ride the wire from the
  engine's pre-truncation tally.

## Status

Active. Promoted from the `2026-06-22-filtering-reconciliation` cycle after the
plan-state derivation bug, on explicit user direction. Sharpened in the
`2026-06-29-plan-document-rendering` cycle with the bounded-slice corollary: plan
structure counts + per-wave/phase rollups + completion state are now engine-served
pre-truncation (replacing the client-side `rollupSteps`/`sumRollups` that
undercounted a truncated interior). Sibling rules `engine-read-and-infer` (the
engine owns inference), `dashboard-layer-ownership` (stores is the sole wire
client), `degradation-is-read-from-tiers-not-guessed-from-errors` (the same law for
degradation), `node-facets-filter-on-the-engine` (filter facets apply on the
engine), `graph-queries-are-bounded-by-default` (the truncation ceiling the
bounded-slice corollary guards against),
`client-narrowed-listings-hold-the-full-paginated-set` (the sibling list-surface
shape of the same hazard).

## Source

The `2026-06-22-filtering-reconciliation` cycle: the `plan_states` facet rebuilt
to derive plan completion from `progress` in `engine-query` (served, not
frontend-derived) after the `lifecycle.state`-keyed version leaked tiers/statuses/
severities into the Plan-status control. Sibling ADRs
`2026-06-22-unified-filter-plane-adr`, `2026-06-22-graph-filter-fetch-split-adr`.
Bounded-slice corollary: the `2026-06-29-plan-document-rendering` cycle, where the
engine `plan-interior` projection (`engine-query/src/node.rs`) was extended to serve
per-wave/phase `rollup` and a per-plan `summary` (counts + `plan_state` via the one
`plan_completion_from_progress` authority) computed pre-truncation, and the
client-side rollup math was deleted from `frontend/src/stores/server/queries.ts`.
