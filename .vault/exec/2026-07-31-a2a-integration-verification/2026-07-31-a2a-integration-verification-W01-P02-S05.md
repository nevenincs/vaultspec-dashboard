---
tags:
  - '#exec'
  - '#a2a-integration-verification'
date: '2026-08-02'
modified: '2026-08-02'
body_schema: 'body-v1'
body_hash: 'sha256:fe94b23a6e0e5a0e24320f087120c1c47f953c6083e3aea378b7fb58faa3738a'
step_id: 'S05'
related:
  - "[[2026-07-31-a2a-integration-verification-plan]]"
---

# Land the permanent completion proof by driving an in-process deterministic-model run resolved through the production provider factory to a completed terminal state through the real gateway and real worker, asserting exact scripted content and emitting a durable review bundle containing the authored output plus transcript or execution evidence bound to the exact scenario and run, failing rather than skipping when the substrate or any required artifact is absent

## Scope

- `src/vaultspec_a2a/acceptance/tests/`

## Description

- Add the deterministic real-process acceptance scenario and durable review-bundle contract.
- Demonstrate missing engine discovery and non-durable bundle roots fail loudly.
- Execute the final-source scenario through the real gateway, worker, provider factory, and engine authoring loop.

## Outcome

Committed A2A revision `7096370c` passed the final deterministic run in 86.49 seconds. The final bundle carries matching terminal/history run identities, five non-secret hashed artifacts, exact scripted authoring evidence, and `pending:W01.P02.S31`; it remains intentionally unapproved until manual inspection.

## Notes

The current dashboard CLI had to be rebuilt because the stale binary lacked the authoring-token endpoint. The existing gateway teardown warning about an unawaited coroutine remains recorded and was not suppressed.
