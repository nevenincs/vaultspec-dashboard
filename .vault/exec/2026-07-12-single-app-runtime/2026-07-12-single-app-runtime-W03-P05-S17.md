---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S17'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# Add one-shot CLI provisioning verbs (provision status, install, upgrade, migrate) calling the shared broker in-process with the standard envelope vocabulary, exit codes, and the confirm-gated force posture the wire enforces

## Scope

- `engine/crates/vaultspec-cli/src/cmd/provision.rs`

## Description

- Add `vaultspec provision [status|install|upgrade|migrate|acquire]` (`engine/crates/vaultspec-cli/src/cmd/provision.rs` + clap subcommand): managed roots host their own state; a NOT-yet-managed root is registered into the engine-owned bootstrap state and targeted through the registry so the engine never scaffolds `.vault/` into an unmanaged repository.
- Force stays confirm-gated exactly as the wire enforces; results carry the served envelope's own tiers.

## Outcome

`vaultspec provision status` verified live against this workspace (managed=true, floors, providers, pending migrations).

## Notes

The unmanaged-root path reuses `bootstrap_root` (made pub) — the same engine-owned host state the first-run boot uses.
