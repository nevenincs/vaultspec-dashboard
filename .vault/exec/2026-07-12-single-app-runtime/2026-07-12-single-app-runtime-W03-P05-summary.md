---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# `single-app-runtime` `W03.P05` summary

Both Steps (S16-S17) complete, committed as `97b69126aa`.

- Modified: `engine/crates/vaultspec-api/src/routes/provision.rs`, `engine/crates/vaultspec-api/src/lib.rs`, `engine/crates/vaultspec-cli/src/main.rs`, `engine/crates/vaultspec-cli/src/cmd/mod.rs`
- Created: `engine/crates/vaultspec-cli/src/cmd/provision.rs`

## Description

CLI provisioning parity. The provision plane grew a one-shot facade (`cli_status`, `cli_run`) that drives the exact route handlers in-process — same DTO grammar, same typed capability construction, same bounded single-flight job broker, polled to a terminal state — so the terminal, the boot log, and the GUI cannot disagree. `vaultspec provision status|install|upgrade|migrate|acquire` targets the cwd project; a not-yet-managed root is registered through the engine-owned bootstrap state and resolved via the registry so the engine never scaffolds `.vault/` into an unmanaged repository. Verified live against this workspace.
