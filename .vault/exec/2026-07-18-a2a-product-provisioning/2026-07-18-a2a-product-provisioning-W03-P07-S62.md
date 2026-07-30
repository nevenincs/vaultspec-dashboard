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
- Descriptor replay refusal and busy refusal without consuming the one-time descriptor are retained from the earlier subset.
- Redaction is proven against REAL credential material rather than a planted marker: the earlier proof only showed that descriptor bytes — secret-free by design — are not echoed. The updater now runs on an install whose ownership capability and attach-control token genuinely exist, on both a completing and a refused run, and neither token appears anywhere in its output.

## Outcome

Twelve real-process proofs, green on repeated runs. Commits `5a6908ed22` and `f6ec2ec776`. Gate at commit: `cargo fmt --check` exit 0, `cargo clippy -p vaultspec-updater --all-targets -D warnings` exit 0, `cargo test -p vaultspec-updater` green.

## Notes

Two boundaries stated rather than glossed. First, the ordering proof reaches the activation boundary and rolls back there; the swap itself is the activation seam's, and the transaction phase machine makes swap unreachable except after migration, so singleton-release-before-swap follows from the proven release-before-snapshot plus that machine rather than from a swap executed here. Second, the gateway's INTERNAL admission close and run/checkpoint resolution are performed by the real helper process standing in for the A2A gateway, which this repository does not build; what is proven on this side is the updater's obligation — the authenticated drain is acknowledged before the owner-authorized stop is issued, and an unauthenticated or unauthorized call is refused by the gateway, so the drive completes only when both credentials were presented in that order.

The earlier record's residual — one top-level fresh-update success call threading a materialization source — belongs to the activation seam and the candidate path, not to this Step's clauses, and is unchanged.

The gateway helper releases its bootstrap proof before the child reads the credential files: that proof retains exclusive handles, exactly as first install does before a gateway ever boots.
