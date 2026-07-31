---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-30'
body_hash: 'sha256:14821cdfaf3453583eff0e501cea73cd868b1641199906b1afa191c04c83b970'
step_id: 'S60'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Replace the Cargo Dist axoupdater-only flow with copy-out, owner-restricted descriptor handoff, helper launch, seat exit, and updater-observed relaunch

## Scope

- `engine/crates/vaultspec-cli/src/cmd/lifecycle.rs`

## Description

- Cut `vaultspec update` over from the retired Cargo Dist axoupdater sidecar to the product transaction handoff in `engine/crates/vaultspec-cli/src/cmd/lifecycle.rs`: copy the release updater out through `copy_updater_out`, write the one-time owner-restricted descriptor into the transaction directory through `write_handoff_descriptor`, stop the seat, then launch the copy detached with the descriptor as its only operand. The axoupdater path and its bounded subprocess runner are deleted, not kept alongside.
- Grounding finding that changed the shape: the sidecar had already been withdrawn at the packaging level (`install-updater = false` in `dist-workspace.toml`), so the old flow could only ever return its package-manager refusal. The cutover restores a working verb rather than replacing one.
- Nothing in the flow is gated on release sealing. The handoff carries no candidate, so verification is never reached; only the candidate execute path authenticates a candidate, and that is where the retained-in-code trust apparatus stays.
- Extended the handoff contract in `engine/crates/vaultspec-product/src/handoff.rs` with the two facts the updater cannot derive from outside the release: the requesting process id (it runs the very image an activation replaces) and the stable front-door launcher for the relaunch. The updater now waits the requester out under the held lock before it retires the descriptor or mutates anything, and spawns the recorded front door after its run resolves.
- Fixed a live Windows defect found while proving the launch: every `vaultspec-updater` executable tripped Windows installer detection and demanded elevation, so the detached launch failed with `ERROR_ELEVATION_REQUIRED` and the crate's own test binaries could not execute at all on Windows. An embedded `asInvoker` manifest, emitted from `build.rs` for the Windows targets, settles it.

## Outcome

The verb performs the real transaction handoff, the copied helper honours the relaunch instruction, and the updater's Windows test binaries execute for the first time. Commit `668715e290`. Gate at commit: `cargo fmt --check` exit 0, `cargo clippy --workspace --all-targets -D warnings` exit 0, `cargo test -p vaultspec-updater` green, `cargo test -p vaultspec-cli` green.

## Notes

The prior record deferred this cutover behind release sealing. That premise does not hold: the free-open-source amendment retains the trust apparatus in code but removes it as a release gate, and a recovery-and-relaunch handoff never reaches verification at all. The deferral is discharged, not waived.

Staging an update candidate stays outside this flow — no producer of an execute intent exists in production code, and a handoff never invents one.
