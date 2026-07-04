---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-06-30'
modified: '2026-06-30'
step_id: 'S03'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Add route shell tests for disabled-state behavior, bearer gating, and shared route registration

## Scope

- `engine/crates/vaultspec-api/src/routes/`

## Description

- Add a route shell test for the authoring status endpoint.
- Add negative route tests for unknown authoring API paths and unsupported methods.
- Extend the route inventory spot-check with `/authoring/status`.
- Reuse the existing bearer-gate drift guard by adding the route to `CONTRACT_ROUTES`.
- Run focused authoring and route invariant tests.
- Run the full `vaultspec-api` lib test suite.

## Outcome

Targeted checks passed for the authoring status route, authoring API misses, unsupported method handling, router inventory drift, bearer gating, and the existing health/status gate. The full `vaultspec-api` lib suite passed with 152 tests.

## Notes

The first `cargo fmt -p vaultspec-api` attempt was run from the repository root and failed because the Rust workspace manifest lives under `engine/`. Formatting then succeeded with `cargo fmt --manifest-path engine/Cargo.toml -p vaultspec-api`.
