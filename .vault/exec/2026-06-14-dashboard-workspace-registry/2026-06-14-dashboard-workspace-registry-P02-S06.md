---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S06'
related:
  - "[[2026-06-14-dashboard-workspace-registry-plan]]"
---

# Add the GET /workspaces route returning id, label, path, launch-default marker, reachability, and the tiers block

## Scope

- `engine/crates/vaultspec-api/src/routes/registry.rs`

## Description

- Add the `routes/registry.rs` module and register it in the routes mod and the router.
- Add the `GET /workspaces` route returning each registered root's id, label, monospace path, launch-default marker, reachability, and unreachable reason, plus the active-workspace id, through the shared `{data, tiers}` envelope.
- Re-probe each root's reachability read-only on every enumeration (discover + enumerate, no mutation) and persist the refreshed state so a moved or missing root renders degraded and retry-able rather than vanishing.
- Add `/workspaces` to the bearer-gate API prefixes and the contract route inventory so it is gated and not shadowed by the SPA fallback.

## Outcome

The registry is enumerable on the wire with honest reachability and the tiers block on every response. A route test asserts the launch root, its marker, reachability, the active-workspace id, and the tiers block.

## Notes

`/workspaces` is read-only enumeration; registry mutation rides `/session` (config), never this route or the `/ops` proxy, keeping the read-and-infer fence intact.
