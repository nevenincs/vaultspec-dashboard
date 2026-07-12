---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# `single-app-runtime` `W02.P03` summary

All five Steps (S08-S12) complete, committed as `97b69126aa`.

- Modified: `engine/crates/vaultspec-cli/src/main.rs`, `engine/crates/vaultspec-cli/src/cmd/mod.rs`, `engine/crates/rag-client/src/client.rs`, `engine/crates/vaultspec-cli/Cargo.toml`
- Created: `engine/crates/vaultspec-cli/src/cmd/launch.rs`

## Description

The application front door. Bare `vaultspec` (a double-click) and the explicit `open` verb resolve the target workspace (cwd worktree, else launcher last-active, else none), attach to a live seat via the discovery + health predicate or spawn `vaultspec serve` fully detached (no console window on Windows) with a bounded discovery wait, register/select the workspace on the seat through the `/session` write seam (a new inherent `put_json` on the reused loopback transport), open the default browser detached with a printed-URL fallback, and exit. A crash-loop guard refuses to respawn a seat that died within a minute of launch and points at the crash log. Every existing verb stays byte-identical.
