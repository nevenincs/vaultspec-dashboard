---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S15'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---




# Spawn only the manifest-declared gateway entrypoint and contain the owned process tree through bounded graceful and forced cleanup

## Scope

- `engine/crates/vaultspec-product/src/process.rs`

## Description

- Add `process.rs` with `GatewaySpec::from_manifest`, which resolves the launch
  program ONLY from the capsule manifest's declared gateway `relative_command`
  under the capsule root, validating each segment against traversal/separators.
- Add `spawn_gateway` and `GatewayProcess` containing the owned tree: on Unix via
  a safe `process_group(0)` leader plus `killpg` SIGTERM-then-SIGKILL; on Windows
  via a `command-group` job object terminated after a graceful window.
- Implement bounded `terminate_tree(graceful)` that gives the tree the graceful
  window to exit, then force-kills and reaps, reporting whether force was needed.

## Outcome

A real spawned gateway and its real grandchild are both terminated by
`terminate_tree` with no orphan; `from_manifest` builds the exact declared path
and refuses a traversal segment.

## Notes

The workspace forbids `unsafe`, so Unix process-group creation uses the safe
`CommandExt::process_group(0)` (not a `pre_exec` `setsid`); Windows subtree kill
uses the `command-group` job object, the reason that dependency is declared.
Graceful termination on Windows has no POSIX signal, so it degrades to a
graceful-window wait then a forced job terminate.
