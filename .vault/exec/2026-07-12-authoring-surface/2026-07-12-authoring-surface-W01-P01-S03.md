---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S03'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# Accept the plan-step operation on the direct-writes route as a direct-only self-approved changeset with provenance, keyed on plan node id plus canonical step id

## Scope

- `engine/crates/vaultspec-api/src/authoring/http.rs`

## Description

- Add the `plan_step` field to the `DirectWriteRequest` wire type (`api.rs`), the plan document named by `ref` and fenced by `expected_blob_hash`.
- Add the `SetPlanStepState` arm to `validate_operation` in `direct_write.rs` (R1 discipline: reject `body`/`frontmatter`/`new_stem`/`create`; require `plan_step`, `ref`, and `expected_blob_hash`), plus the `DirectOperationInput::SetPlanStepState` variant.
- Extend the operation-metadata helpers (`operation_document_ref`, `operation_expected_blob_hash`, `operation_target_blob_hash`) and the `build_draft` dispatch to the new kind, reusing the SAME per-kind materializer path the propose flow uses.
- Join the plan tick to the existing-document stale-base pre-check arm (the engine-side concurrency fence: resolve the plan, compare the current worktree blob against `expected_blob_hash`, refuse as `Conflict` on mismatch), and to the two post-propose conflict re-check sites.

## Outcome

- The `POST /authoring/v1/direct-writes` route handler needs NO change: it deserializes `DirectWriteRequest` and forwards to `execute_direct_write`, so the new operation is accepted, self-approved, and applied as a `kind=direct` changeset with the server-resolved principal as provenance — identical to how body/frontmatter/rename/create saves ride the route. This is the acceptance the plan attributed to the route file.
- Idempotency/keying: the plan tick's `ref` (plan node) and `step_id` both enter the direct-write `request_digest`, so two ticks of different steps are distinct payloads. The client-supplied idempotency key still governs dedup/replay; keying it per (plan, step) is the frontend's responsibility in W02.P03/P04.

## Notes

- The plan named this step's file as `http.rs`; the actual acceptance logic lives in `direct_write.rs` (validate/build/pre-check) because the route is generic over `DirectWriteRequest`. The only `http.rs` change in this phase is the foreign-lane `StoreError::Comment` error-mapping arm (see the S01 record), unrelated to the plan tick.
