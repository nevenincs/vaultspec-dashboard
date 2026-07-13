---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# `single-app-runtime` `W01.P02` summary

All three Steps (S05-S07) complete, committed as `150c0bb7d6`.

- Modified: `engine/crates/vaultspec-api/src/lib.rs`, `engine/crates/vaultspec-api/src/app.rs`, `engine/crates/vaultspec-api/src/routes/mod.rs`, `engine/crates/vaultspec-api/src/routes/spa.rs`, `engine/crates/vaultspec-cli/src/main.rs`, `engine/crates/vaultspec-cli/src/cmd/mod.rs`, `engine/crates/vaultspec-cli/src/cmd/status.rs`, `engine/crates/vaultspec-cli/Cargo.toml`
- Created: `engine/crates/vaultspec-api/src/routes/lifecycle.rs`, `engine/crates/vaultspec-cli/src/cmd/lifecycle.rs`

## Description

Owned lifecycle. One shared graceful-shutdown path (ctrl-c, SIGTERM, and the bearer-gated `POST /shutdown`) drains axum, retracts the discovery file owner-checked, and releases the seat on every exit route. The CLI grew machine verbs handled before scope resolution: `stop` (wire shutdown with bounded platform-kill fallback, idempotent), `restart` (stop + detached relaunch), and a `seat` block on `status` (running/pid/port/uptime + launcher-known workspaces). The existing bearer anti-drift guard caught the new route missing from `API_PREFIXES` before it could ship ungated.
