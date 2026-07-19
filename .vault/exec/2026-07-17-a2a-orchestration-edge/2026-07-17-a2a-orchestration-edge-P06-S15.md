---
tags:
  - '#exec'
  - '#a2a-orchestration-edge'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S15'
related:
  - "[[2026-07-17-a2a-orchestration-edge-plan]]"
---

# Add the engine-scoped active-run discovery verb with fixed two-result upstream bound, optional bounded feature filter, and real-loopback contract coverage

## Scope

- `engine/crates/vaultspec-api/src/routes/ops/a2a.rs`

## Description

- Amend the accepted edge decision and implementation reference with the bounded active-run discovery contract.
- Add `active-runs` to the fixed engine whitelist and inject the active scope root into sibling discovery.
- Persist the engine-controlled workspace root in run-start metadata and reject stale expected-scope generations.
- Validate the optional feature tag and pin the upstream result limit to two.
- Exercise the exact query target and verbatim sibling response through a real loopback socket.

## Outcome

The engine now brokers one read-only active-run discovery operation without accepting a browser-controlled workspace path. Dashboard-started runs persist the selector discovery needs, and scope races fail with a typed conflict. Focused Rust coverage passed 29 tests, including the real loopback contract.

## Notes

The first compile exceeded the command wrapper's two-minute limit; the cached rerun completed successfully. Existing test diagnostics about temporary workspaces lacking `.vaultspec` remained non-failing and unrelated.
