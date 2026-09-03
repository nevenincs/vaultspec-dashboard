---
tags:
  - '#exec'
  - '#code-deduplication'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:52dc6e637783d11a69b83fc466e90b328cee9bec3d775d7cefd105bbfc37f14b'
step_id: 'S01'
related:
  - "[[2026-08-01-code-deduplication-plan]]"
---
# Write regression coverage for bounded child process lifecycle and strengthen the canonical owner

## Scope

- `engine/crates/vaultspec-api/src/bounded_child/`

## Description

- Exercise the canonical runner with a real child that continuously reports liveness until the timeout path terminates it.
- Propagate an unsuccessful kill-and-reap operation as the existing typed wait fault on timeout and cap paths.
- Preserve direct owner access with no forwarding layer or compatibility surface.

## Outcome

The bounded-child owner now has a regression proof that the timed-out child stops after the call returns. The focused bounded-child suite passed with nine tests, formatting passed, and an independent Sol review approved the corrected contract.

## Notes

The initial timeout test proved prompt return but not reaping. The independent review caught this and the heartbeat proof replaces it.
