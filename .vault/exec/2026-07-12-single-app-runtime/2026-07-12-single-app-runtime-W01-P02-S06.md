---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S06'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# Serve a bearer-authed shutdown endpoint that triggers the same graceful path and answers before draining, with adverse coverage for unauthenticated and repeated calls

## Scope

- `engine/crates/vaultspec-api/src/routes/lifecycle.rs`

## Description

- Create `engine/crates/vaultspec-api/src/routes/lifecycle.rs`: POST `/shutdown` notifies the state's shutdown Notify and answers through the shared envelope BEFORE draining; idempotent on repeat.
- Register in the router and `CONTRACT_ROUTES`; the route is bearer-gated by the standard middleware.

## Outcome

Bearer-gated graceful stop endpoint live; the anti-drift guard (`every_contract_route_requires_a_bearer`) initially FAILED on the new route until its prefix was added to `spa.rs` `API_PREFIXES` — the guard did its job; all 724 api tests green after.

## Notes

The initial omission from `API_PREFIXES` would have shipped `/shutdown` ungated: caught by the existing adversarial guard, fixed in the same step.
