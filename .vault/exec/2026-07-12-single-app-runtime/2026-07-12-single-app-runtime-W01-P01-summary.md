---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# `single-app-runtime` `W01.P01` summary

All four Steps (S01-S04) complete, committed as `150c0bb7d6`.

- Modified: `engine/crates/vaultspec-api/src/app.rs`, `engine/crates/vaultspec-api/src/lib.rs`, `engine/crates/vaultspec-session/src/lib.rs`, `engine/crates/vaultspec-api/Cargo.toml`, `frontend/vite-plugins/engine-dev.ts`, `frontend/src/testing/liveEngine.globalSetup.ts`, `frontend/e2e/authoring/engine.ts`
- Created: `engine/crates/vaultspec-session/src/app_home.rs`, `engine/crates/vaultspec-api/src/seat.rs`

## Description

Discovery hardening and the seat foundation. The service.json write became atomic (temp + rename) and the heartbeat owner-checked, killing the same-workspace clobber race with a concurrent-writer proof test. The machine app home (`~/.vaultspec`, `VAULTSPEC_APP_HOME`-overridable) landed with the bounded launcher-state file. The seat is an OS exclusive file lock (`fs4`) acquired before any heavy boot work: a live conflict fails loud naming the running seat; kernel release-on-death makes dead-pid takeover automatic. Seated serves publish discovery at the app home; exempt serves (`--no-seat`, `--port 0`) keep the workspace-local file byte-compatible, and all three frontend spawn sites pass `--no-seat`.
