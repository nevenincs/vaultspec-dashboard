---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S11'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Build the lineage error response through the shared envelope helper so the tiers block rides the error envelope

## Scope

- `engine/crates/vaultspec-api/src/routes/temporal.rs`

## Description

- Route every lineage error through the shared error path so the tiers block rides the error envelope: `validate_scope` returns `super::api_error` for an unknown scope; a malformed filter, an inverted range, and a filter-validation error (unknown tier/relation/state) all return `super::api_error(&state, BAD_REQUEST, ...)`.
- Match the events handler's inverted-range fail-fast shape and the graph-query filter-error shaping.

## Outcome

Every lineage error path 400s through the shared envelope with the per-tier `tiers` block attached, so a client distinguishes a malformed request from a degraded backend.

## Notes

The projection's `FilterError` (unknown facet vocabulary) and a syntactic JSON parse failure are shaped separately but both ride `api_error`; no error path hand-builds a Json body.
