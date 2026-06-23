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
when the inputs happen to be on the wire.

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
- **Bad:** the frontend computing a plan's in-progress/finished from `done/total`,
  classifying a node's category from heuristics, or inferring "offline" from a
  transport error — each re-derives a fact the backend should own, drifts from the
  engine, and (as the plan-state bug showed) silently goes wrong while tests pass.

## Status

Active. Promoted from the `2026-06-22-filtering-reconciliation` cycle after the
plan-state derivation bug, on explicit user direction. Sibling rules
`engine-read-and-infer` (the engine owns inference), `dashboard-layer-ownership`
(stores is the sole wire client), `degradation-is-read-from-tiers-not-guessed-from-errors`
(the same law for degradation), `node-facets-filter-on-the-engine` (filter facets
apply on the engine).

## Source

The `2026-06-22-filtering-reconciliation` cycle: the `plan_states` facet rebuilt
to derive plan completion from `progress` in `engine-query` (served, not
frontend-derived) after the `lifecycle.state`-keyed version leaked tiers/statuses/
severities into the Plan-status control. Sibling ADRs
`2026-06-22-unified-filter-plane-adr`, `2026-06-22-graph-filter-fetch-split-adr`.
