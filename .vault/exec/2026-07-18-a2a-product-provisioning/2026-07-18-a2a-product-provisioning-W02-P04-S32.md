---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S32'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Expose product installation, gateway, worker, provider, and admission facts without collapsing cold worker state into degradation

## Scope

- `engine/crates/vaultspec-api/src/routes/stream.rs`

## Description

- Added `stream_facts` on the lifecycle plane and wired it into the `/status` backends block as `a2a`: installation, gateway identity, the one readiness model, and lifecycle admission (single-flight in-flight count plus ceiling).
- Kept a cold worker on a live gateway READY, never collapsed into a degraded backend.
- Stated worker/provider processes honestly as gateway-owned run-scoped children the dashboard does not census (ADR D4), rather than fabricating a census.

## Outcome

`/status` exposes the A2A product facts alongside core/rag. Build/clippy/fmt green; the api lib suite (870) passes.

## Notes

None.
