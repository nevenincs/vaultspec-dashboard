---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S02'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Declare bounded serialization, digest, file-lock, process, and platform dependencies for product lifecycle authority

## Scope

- `engine/crates/vaultspec-product/Cargo.toml`

## Description

- Declare `serde` 1.0.228 with derive support and `serde_json` 1.0.150 without the unbounded-depth feature for typed, implementation-bounded JSON contracts.
- Reuse `sha2` 0.10.9 without default features for release SHA-256 verification and `fs4` 0.13 with only synchronous locking for installation exclusion.
- Add `sysinfo` 0.39.6 with only the system feature for cross-platform process identifier, parent, executable, and start-time inspection.
- Fence `nix` 0.29 with only signal support to Unix process-group cleanup and featureless `command-group` 5.0.1 to Windows suspended-spawn Job Object containment.
- Refresh `engine/Cargo.lock` through focused Cargo resolution without updating an existing package version.

## Outcome

- `engine/crates/vaultspec-product/Cargo.toml` now declares the minimum safe dependency surface needed by later product-authority implementations on Windows, macOS, and Linux.
- The platform split reuses the workspace's proven Unix `nix::killpg` and `fs4` patterns while keeping Windows unsafe system calls behind the safe `command-group` boundary required by the workspace-wide unsafe-code prohibition.
- `engine/Cargo.lock` records the new process-inspection and safe Windows containment closures while retaining the existing serde, SHA-2, file-lock, Unix signal, libc, and WinAPI resolutions.
- Cargo metadata, focused Windows-host and Linux-target checks, focused tests, warning-denied Clippy, workspace format, target-specific dependency trees, cargo-deny policy, `just dev lint all`, and feature-scoped Vaultspec checks completed successfully.

## Notes

- Serialization byte limits remain implementation invariants for later parsers; no dependency can replace capped reads, and `serde_json`'s unbounded-depth feature remains disabled.
- Process start time is identity evidence, not ownership proof. Later discovery validation must also bind the receipt owner, generation, executable identity, heartbeat, and authenticated readiness before mutation.
- The all-target lock graph contains `command-group`'s Unix-only `nix` 0.27 edge alongside the workspace's `nix` 0.29. Per-target trees compile only `nix` 0.29 on Unix and only `command-group` on Windows, so no supported target carries both versions.
- Windows credential access-control enforcement remains a deliberate later contract decision; no unproven ACL dependency was added in this step.
- No product module, manifest schema, lifecycle behavior, or S03-and-later contract was implemented. The S02 plan row remains open and this change remains uncommitted for independent supervisor review.
