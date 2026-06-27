---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S03'
related:
  - "[[2026-06-14-dashboard-workspace-registry-plan]]"
---

# Auto-register the launch workspace as the first root on first run

## Scope

- `engine/crates/vaultspec-session/src/lib.rs`

## Description

- Add an `auto_register_launch` method on the user-state handle: it seeds the launch workspace as the first launch-default root when the registry has no row for that id, and is an idempotent no-op when the id is already present (a reboot does not re-seed or reorder).
- Wire the call into the API serve boot path: discover the workspace read-only, derive the stable id from the canonical git common dir, default the label to the launch root's final path component, auto-register, and seed the active workspace to the launch id when none is selected.

## Outcome

A fresh or best-effort-recreated registry seeds the launch workspace on boot so the single-project experience is unchanged, and a registry that already holds the launch id is left untouched across reboots. The boot wiring is best-effort: a discovery or store failure degrades to no-registry-seeded, and the rail renders the launch workspace as its header fallback.

## Notes

The auto-register logic lives in the session crate (git-free) and is invoked from the API boot path where the git common dir is resolved read-only; the boot call is a shared-file change to the `vaultspec-api` serve path, recorded for the next executor.
