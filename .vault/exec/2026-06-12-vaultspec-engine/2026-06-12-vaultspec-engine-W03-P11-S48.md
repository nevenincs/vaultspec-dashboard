---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S48'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement the axum app skeleton with loopback-only bind, port flag failing loud on conflict, service json discovery with bearer token and heartbeat, ungated health route and bearer gating elsewhere

## Scope

- `engine/crates/vaultspec-api/src/app.rs`

## Description

- Implement the axum app skeleton: loopback-only bind with fail-loud port conflict, service-json discovery (port, bearer token, pid, heartbeat refreshed every 15s), ungated health route, bearer middleware everywhere else.
- Wire the watcher: dirty batches drive rebuild-at-scope-granularity - a fresh graph is indexed and swapped behind the lock, never deltas into a live graph.

## Outcome

Contract section 1 single-origin posture served. Audit gates W02P06-302/303 CLOSED here: the rebuild-swap path prunes removed mentions (the prescribed edit-that-removes-a-mention test proves the live graph converges to the cold rebuild), and the old-to-new diff feeds the ring and the live channel on one monotonic clock.

## Notes

Bearer token derives from pid+time content hash (no rand dependency); not an auth boundary per the contract - loopback only.
