---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-30'
modified: '2026-07-30'
body_schema: 'body-v1'
body_hash: 'sha256:beefedab45c6ed3e13cee958a47d666b861a1f37070732c07d8d7157b54a887f'
step_id: 'S44'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Prove dashboard run-start remains one of five public verbs, downstream prepare refusal mints nothing, invalid roles fail closed, commit failure cancels and revokes, attach-control-authenticated terminal callbacks settle once after durable A2A state, INPUT_REQUIRED retains the lease, and restart or expiry reconciliation revokes the exact bundle

## Scope

- `engine/crates/vaultspec-api/src/lib_tests/a2a_run_admission.rs`

## Description

- Audit the existing acceptance coverage before authoring: commit-failure cancel-and-revoke, ambiguous-transport retain-and-retry, lost-ack idempotent recovery, unknown-verb 403-before-discovery, attach-control terminal settlement, INPUT_REQUIRED lease retention, and expiry/restart revocation are already proven; do not rewrite them.
- Add a shared refusal-drive helper that runs one real run-start broker round-trip against a live loopback gateway serving a caller-controlled prepare response, asserting the drive fails closed as a protocol error with zero unresolved leases.
- Prove a prepare response failing the five-way admission gate mints nothing, on two distinct legs: a non-prepared stage and a non-ready run admission.
- Prove every malformed prepare-returned role set fails closed with nothing minted: a duplicate role, an id outside the agent charset, an empty set, and a set exceeding the shared 64-role ceiling.
- Pin the verb whitelist's exact membership and cardinality — five control verbs plus the one bounded active-runs read — with distinctness asserted, so any addition, removal, or rename fails a test instead of drifting silently.

## Outcome

Commit `debec9318f`: 121 added lines in `engine/crates/vaultspec-api/src/routes/ops/a2a_tests.rs`, three new tests plus one helper, all in the file's existing real-loopback-server fixture style (no mocks, stubs, or fakes). Full module suite green: 22 passed, 0 failed; rustfmt clean. The prepare-refusal and role-validation gates were correct by construction (the broker returns before any provisioning on prepare failure) — this Step adds the missing proof, not a fix.

## Notes

- Scope-path deviation, deliberate: the scoped test file does not exist and the broker-level fixtures (`TEST_PREPARE_RESPONSE`, the loopback request/response helpers, the lease-count helper) all live in the module's own test file, so the tests were authored there instead of splitting unit-level broker tests into a new integration file. The plan Step's scope path should be repathed to `engine/crates/vaultspec-api/src/routes/ops/a2a_tests.rs`.
- One transient full-suite run showed a single unrelated failure that did not reproduce on two subsequent green runs (22/22 twice); attributed to parallel-lane interference on the shared tree, not to the added tests.
