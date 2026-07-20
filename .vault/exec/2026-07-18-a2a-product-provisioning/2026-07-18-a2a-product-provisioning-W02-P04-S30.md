---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-20'
step_id: 'S30'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---




# Replace token-bearing discovery and unauthenticated health attachment with the product controller's versioned authenticated endpoint resolution

## Scope

- `engine/crates/vaultspec-api/src/routes/ops/a2a.rs`

## Description

- Rerouted the `/ops/a2a` pass-through endpoint resolution to a DUAL-RESOLVE (`a2a_endpoint_dual`): PREFER the product controller's authenticated, versioned discovery (`LifecyclePlane::resolve_gateway`, the secret-free gateway-discovery.json + attach-control credential, ADR D5), FALL BACK to the resident service.json + owner-restricted handoff path.
- Wired `execute_broker_call` to build its transport through the dual-resolve; the 6-verb whitelist, active-runs recovery read, and the run-start idempotency machinery (striped locks, preflight, token lifecycle) are untouched.
- Kept the service.json fallback as the transition path (retained, not deleted); a stale/incompatible/untrusted product discovery resolves Unavailable and DEFERS to the fallback rather than displacing a working resident. Removed the now-unused `a2a_transport_from`.

## Outcome

The run edge prefers the ADR-D5 product path and stays green via the service.json fallback until the A2A capsule publishes the product discovery. Behavior-preserving today (no product install → Unavailable → the exact prior fallback path). Gate: build + fmt + lib-clippy clean; touched-scope 61/0 including the `live_loopback` real-socket fallback proof; full api lib 872/0.

## Notes

Live-edge proof accepted on the (b) basis by the phase lead: behavior-preservation (product absent → unchanged fallback, cannot regress the edge verified live earlier) + the `live_loopback` unit test over a real socket + the degraded-path live test. A true product-gateway UP-path e2e is deferred — it needs the not-yet-built install layout, and the resident gateway was not running during this phase.
