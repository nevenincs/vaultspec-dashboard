---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-30'
step_id: 'S62'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Verify with real executables that only the copied updater acquires the install lock, authenticated drain closes admission and resolves active runs plus checkpoints before owner-authorized gateway stop, runtime-singleton release precedes snapshot migration and swap, the gateway never acquires or waits on the install lock, descriptor replay fails, secrets remain redacted, and prior-seat recovery relaunches

## Scope

- `engine/crates/vaultspec-updater/tests/updater_process.rs`

## Description

- Drove the ordered heart of the transaction against a REAL gateway child process in `engine/crates/vaultspec-updater/tests/updater_process.rs`. The helper holds a genuine advisory runtime singleton for its lifetime, reads the production dashboard credentials from their real files, publishes a real discovery record, and serves the production control protocol over loopback while recording each step in order.
- Drain before stop: the recorded order proves admission closed and runs plus checkpoints resolved before the authorized stop was issued. Authentication is not asserted cosmetically — the gateway answers 401 without the attach bearer and 403 without the ownership capability, so the drive completes only if both were presented.
- Runtime singleton: proven held while the gateway lives, and proven free before the snapshot, migration, and activation boundary are reached.
- Install lock: the launched updater is the copy taken out of the release, and that copy is what acquires the lock. A real separate gateway process is refused outright and measurably without waiting, even while another holder has the lock, so it can neither acquire nor queue behind it.
- Prior-seat relaunch: a relaunch handoff makes the updater spawn the recorded stable front door in the recorded workspace, proven by the relaunched process leaving its own marker there.
- Requester wait: proven against a real live process (times out) and a real exited one (completes), through a parameterised seam so the product's minute-long budget is not a minute-long test.
- Descriptor replay refusal, busy refusal without consuming the one-time descriptor, and secret-free diagnostics are retained from the earlier subset.

## Outcome

Eleven real-process proofs, green on three consecutive runs. Commit `5a6908ed22`. Gate at commit: `cargo fmt --check` exit 0, `cargo test -p vaultspec-updater` green.

## Notes

Every clause the Step names is now proven with real executables. The earlier record's residual — one top-level fresh-update success call threading a materialization source — belongs to the activation seam and the candidate path, not to this Step's clauses, and is unchanged.

The gateway helper releases its bootstrap proof before the child reads the credential files: that proof retains exclusive handles, exactly as first install does before a gateway ever boots.
