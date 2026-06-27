---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S21'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---

# wire the new routes into the router and the bearer-gated API prefixes

## Scope

- `engine/crates/vaultspec-api/src/routes/mod.rs`

## Description

- Registered the two new routes in the router build in `lib.rs`: `/session` (GET `get_session`, PUT `put_session`) and `/settings` (GET `get_settings`, PUT `put_settings`), each as one `MethodRouter` with both verbs.
- Added `/session` and `/settings` to `CONTRACT_ROUTES` so the route inventory and the contract drift loudly rather than silently.
- The `pub mod session;` module declaration was added in S19 (required for the handler file to compile); this step is the router wiring.

## Outcome

The session and settings endpoints are reachable through the router. `cargo build -p vaultspec-api` is clean. The routes sit inside the bearer gate and the tiers-envelope guard like every other API route.

## Notes

- The `.put(...)` chains onto the `MethodRouter` returned by `get(...)`, so no new import was needed beyond the existing `get`/`post`.
