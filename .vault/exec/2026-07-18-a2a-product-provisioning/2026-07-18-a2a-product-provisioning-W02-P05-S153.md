---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-21'
step_id: 'S153'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Mount POST /internal/a2a/run-terminal with the dashboard-created attach-control credential, reject worker IPC and unrelated credentials, and avoid adding a sixth public /ops/a2a verb

## Scope

- `engine/crates/vaultspec-api/src/lib.rs`

## Description

- Mounted POST /internal/a2a/run-terminal, deliberately OFF the machine bearer_gate path set (absent from `spa::API_PREFIXES`) and OFF the fixed six-verb /ops/a2a whitelist — the handler self-authenticates the attach-control credential via the required extractor.
- Added `LifecyclePlane::verify_attach_control` (constant-time verify against the stored attach-control credential; missing/unreadable/mismatch is fail-closed), rejecting the worker-IPC and unrelated credentials.

## Outcome

The gateway's attach-control callback reaches the route without a machine bearer, and no sixth public verb was added. Gate: build + clippy clean; router test proves the machine bearer is rejected and attach-control accepted.

## Notes

None.
