---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S60'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Replace the Cargo Dist axoupdater-only flow with copy-out, owner-restricted descriptor handoff, helper launch, seat exit, and updater-observed relaunch

## Scope

- `engine/crates/vaultspec-cli/src/cmd/lifecycle.rs`

## Description

- Built the real Windows owner-restricted descriptor write in `handoff.rs`: create the descriptor empty via `PrivateFileCreation` (carrying `WRITE_DAC`), harden it to the exact three-principal protected DACL through the retained handle BEFORE any byte is written, prove it via the shared `private_policy::validate_private_file` over one DACL snapshot, then write, synchronize, same-handle reread, and re-prove.
- Composed the reviewed windows-authority primitive with the safe `windows-acl` mutation layer; added no unsafe and no native call. Residue cleanup is handle-scoped (create-new + exact-handle delete-on-close), so a pre-existing descriptor is refused, never clobbered.
- The copy-out (`copy_updater_out`), detached helper launch (`spawn_detached_front_door`), and updater-observed relaunch (`relaunch_and_probe`) components were built in the updater crate.

## Outcome

The owner-restricted descriptor write is real and PROVEN on NTFS (write → reopen read-only → validate the protected three-principal DACL → round-trip), APPROVED by independent review with no revision.

## Notes

RESIDUAL (why the row's `lifecycle.rs` target stays behind the deliverable): the axoupdater to handoff CUTOVER in `lifecycle.rs` is deferred — axoupdater stays operative until the full `drive_fresh_update` flow is un-gated, which depends on the distribution-authority sealing (the empty production TUF root ceremony + the Windows datastore gate), a separate lane. All S60 components (owner-restricted write, copy-out, helper launch, relaunch/probe) are built and reviewed; only the final CLI-entry wiring awaits that lane.
