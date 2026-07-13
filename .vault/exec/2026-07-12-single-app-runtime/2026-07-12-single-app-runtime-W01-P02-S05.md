---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S05'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# Install signal-driven graceful shutdown (ctrl-c and SIGTERM through axum with_graceful_shutdown) that drains connections bounded, closes SSE streams, removes the discovery file, and releases the seat on every exit path

## Scope

- `engine/crates/vaultspec-api/src/lib.rs`

## Description

- Replace the bare `axum::serve` await with `with_graceful_shutdown` over ONE shared exit future: ctrl-c, SIGTERM (unix), and the state's `shutdown` Notify.
- After the drain, retract discovery via the new owner-checked `remove_service_json_if_owned` and release the seat guard by drop.
- Add `shutdown: tokio::sync::Notify` and `started_ms` to `AppState` (discovery now advertises `started_ms` so the CLI seat block reports uptime); enable tokio's `signal` feature.

## Outcome

Every exit route (signal or wire) runs the same drain + discovery retraction + seat release; the crate builds and the full api suite passes.

## Notes

SSE streams end when axum stops accepting and clients disconnect; the drain has no extra bound beyond client closure — acceptable for loopback.
