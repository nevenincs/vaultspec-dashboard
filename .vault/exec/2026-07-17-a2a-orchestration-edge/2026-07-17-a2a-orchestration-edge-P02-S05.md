---
tags:
  - '#exec'
  - '#a2a-orchestration-edge'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S05'
related:
  - "[[2026-07-17-a2a-orchestration-edge-plan]]"
---

# Write guard tests mirroring the rag ops suite plus a live loopback test against a real a2a gateway covering whitelist miss, degraded sibling, crash, and verbatim envelope pass-through

## Scope

- `engine/crates/vaultspec-api/src/routes/ops/tests.rs`

## Description

- Mirror the shipped rag ops guard suite's shape for the a2a pass-through: whitelist-miss rejection, degraded-sibling 200, crash/timeout escalation, and verbatim envelope pass-through, each proven as a distinct test case.
- Add a live loopback test standing up a real (test-harness) a2a gateway rather than mocking the sibling, per the project's mock-free test-integrity mandate.
- Cover the token-bundle injection path from S04 (bundle present in the forwarded payload, absent from any captured log output).

## Outcome

Landed at commit `fd7069cb01` alongside S03/S04, in `routes/ops/a2a.rs` (guard tests colocated with the module rather than a separate `tests.rs`, matching the module's own convention). `cargo test -p vaultspec-api routes::ops` — 63 passed, 0 failed (opus-edge's verification; ops re-checked the crate compiled clean including this module before staging the commit).

## Notes
