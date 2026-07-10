---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-07'
modified: '2026-07-07'
step_id: 'S153'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Add tool tests for read context, search, propose, validate, approval request, cancel, apply request, and rejected core-shaped verb

## Scope

- `engine/crates/vaultspec-api/src/authoring/tools.rs`

## Description

- Re-ground S153 against the W12.P31 plan row, S151 checklist, S152 execution
  record, and the current semantic tool tests.
- Dispatch a read-only S153 gap sidecar to identify missing tests before
  editing.
- Add positive `validate_proposal` preparation coverage proving the prepared
  dispatch carries `CommandKind::ValidateProposal`, the idempotency key,
  `changeset_id`, `expected_revision`, and `summary`.
- Expand mutating-tool missing-idempotency coverage across `propose_changeset`,
  `validate_proposal`, `request_approval`, `cancel`, and `request_apply`.
- Strengthen `read_context` positive coverage for document, proposal, session,
  and document-list targets, including default bounded `max_bytes` behavior.
- Strengthen `request_apply` assertions so the prepared envelope preserves
  command, idempotency key, `changeset_id`, `approval_id`, risk tier, and
  permission requirement.
- Strengthen `cancel` assertions for proposal and run targets, including
  revision fence, summary, run id, reason, command, and idempotency key.
- Strengthen catalog assertions for multi-command aliases on `propose_changeset`
  and `cancel`.
- Strengthen core-shaped rejection coverage so recursive payload key/value
  smuggling is rejected before DTO dispatch.
- Preserve the existing route-level catalog/prepare test as the principal-gated
  surface proof for S153.
- Run a read-only post-change reviewer; confirm no high or critical S153
  blockers remain.

## Outcome

S153 expands the semantic agent-tool test suite so every tool named by the
phase row has direct coverage: read context, search, propose, validate,
approval request, cancel, apply request, and rejected core-shaped tool/payload
inputs. The additions remain test-only and do not implement permission,
interrupt, durable tool-call, or execution behavior reserved for later rows.

## Notes

- Verification:
  - `cargo fmt -p vaultspec-api --manifest-path engine/Cargo.toml`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::tools -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::http::tests::authoring_router_serves_agent_tool_catalog_and_principal_gated_prepare -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring -- --nocapture`
  - `cargo clippy -p vaultspec-api --manifest-path engine/Cargo.toml --all-targets -- -D warnings`
- Focused tool tests passed 12 tests.
- The route-level catalog/prepare test passed.
- The broader authoring slice passed 334 tests.
- Clippy passed with `-D warnings`.
- One first authoring test command timed out while contending for build locks;
  it was rerun with a longer timeout and passed.
- Stale processes from the timed-out run were stopped before closing the step.
