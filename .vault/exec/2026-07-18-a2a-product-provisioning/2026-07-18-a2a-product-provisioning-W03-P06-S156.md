---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-21'
step_id: 'S156'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Implement the Scoop authority adapter by invoking only phase-zero-proven Scoop manager commands for pinned complete archives and never writing Scoop-owned apps, shims, cache, or bucket state

## Scope

- `engine/crates/vaultspec-product/src/channels/scoop.rs`

## Description

- Add the shared manager-authority primitives to the channels module: `PinnedArtifact` (a validated pinned complete artifact — bounded identity + lowercase SHA-256 digest, never a path), `ProvenManager` (a package manager proven present by a phase-zero preflight — construction requires a real regular-file program), and `AuthorizedManagerOperation` (a validated, ready-to-delegate descriptor naming channel + proven program + closed operation label + pinned artifact, with no file-writing authority).
- Add the Scoop channel adapter (`ScoopAuthority`): reports Scoop channel facts (manager ownership true), mints the sealed Scoop provenance, and exposes a CLOSED `ScoopOperation` set (install/update/uninstall) authorized only against a `ProvenManager` and a `PinnedArtifact` — no free-form Scoop command is representable and there is no API here that writes a Scoop-owned app, shim, cache, or bucket file.
- Add unit tests: shared artifact/proven-manager validation, Scoop channel/provenance facts, and closed-operation authorization producing the right descriptor.

## Outcome

Delivered `src/channels/scoop.rs` (+ tests) and the shared manager primitives in `src/channels.rs`. Full product gate green: build, `cargo test -p vaultspec-product` (129 lib + all integration), `clippy --all-targets -D warnings`, `fmt --check` all exit 0.

## Notes

Landed as one buildable slice with the WinGet (S157) and MSI (S158) sibling adapters, which share the same `PinnedArtifact`/`ProvenManager`/`AuthorizedManagerOperation` infrastructure; each step has its own execution record and plan tick. The managers are absent in CI, so actual delegation/execution is deferred to the external updater (W03.P07/W04) where the real manager CLI contract is pinned; this step delivers the validated operation descriptors, sealed provenance, and phase-zero proven-manager gate — not invented scoop argv. No scaffolds or skipped work.
