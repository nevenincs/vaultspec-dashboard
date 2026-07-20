---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-20'
step_id: 'S31'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---




# Resolve run streams through the same authenticated product endpoint and reject stale, incompatible, or untrusted discovery

## Scope

- `engine/crates/vaultspec-api/src/routes/ops/a2a_stream.rs`

## Description

- Rerouted the run-stream relay reader's upstream endpoint resolution to the same DUAL-RESOLVE (`super::a2a::a2a_endpoint(plane)`): product-controller authenticated discovery preferred, service.json + handoff fallback; stale/incompatible/untrusted product discovery defers to the fallback.
- Threaded the seated `LifecyclePlane` from the `a2a_run_stream` handler (added `State<AppState>`) through `ensure_relay_reader`/`finish_relay_reader` into the reader thread, so the process-global relay registry resolves through the seated controller.
- Left the relay ring/gap/degrade + verbatim-frame + single-producer contracts unchanged.

## Outcome

The relay resolves its upstream through the authenticated product path with the service.json fallback, preserving the live progress relay. Gate: build + fmt + lib-clippy clean; touched-scope 61/0; full api lib 872/0.

## Notes

Same (b)-basis live-edge acceptance as S30. The relay's degraded path (emit one `relay_degraded` and retire, browser owns run-status polling) is unchanged and covered by the existing relay tests.
