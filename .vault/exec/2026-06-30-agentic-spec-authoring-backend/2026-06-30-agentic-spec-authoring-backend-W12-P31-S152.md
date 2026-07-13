---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-07'
modified: '2026-07-12'
step_id: 'S152'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Implement the semantic agent tool catalog, tool schemas, bounded scope validation, and command dispatch aliases

## Scope

- `engine/crates/vaultspec-api/src/authoring/tools.rs`

## Description

- Add the `authoring::tools` module for the semantic agent-tool catalog,
  schemas, bounded validation, and dispatch alias preparation.
- Wire the module into the authoring namespace.
- Serve the agent-tool catalog at the authoring router.
- Add a principal-gated tool-call preparation route that validates one agent
  tool call and returns the backend semantic command dispatch alias without
  executing side effects.
- Define exactly seven provider-safe semantic tool names: `read_context`,
  `search_graph`, `propose_changeset`, `validate_proposal`,
  `request_approval`, `cancel`, and `request_apply`.
- Map `propose_changeset` to create, append, and replace proposal aliases over
  existing semantic command kinds.
- Map `request_approval` to a changeset-scoped submit-for-review alias so later
  execution can call the existing backend submit composition instead of a
  separate approval path.
- Map `cancel` to proposal or run cancellation by schema-discriminated target.
- Map `request_apply` only to the approved apply request command; no core
  capability is exposed.
- Bound read context across document, proposal, session, and document-list
  targets.
- Match search argument bounds to the existing search boundary: non-empty
  query, 512-character query ceiling, bounded scope, `vault` or `code` target,
  and `max_results` between 1 and 50.
- Reject unknown tool names, core-shaped tool names, and core-shaped payload
  strings before DTO dispatch.
- Keep actor identity out of tool payloads and route preparation through the
  resolved-principal command extractor.
- Keep durable permission requests, interrupt records, normalized tool-call
  replay, LangGraph fixture replay, and executable side-effect dispatch deferred
  to their later plan phases.
- Add focused tests for catalog membership, schema rejection, core-shaped tool
  and payload rejection, read/search bounds, proposal aliases, approval/cancel/
  apply aliases, and route mounting/principal gating.
- Run an independent code-review sidecar; fix all reported high-severity
  blockers and re-review to confirm no high or critical blockers remain.

## Outcome

S152 implements the semantic agent-tool alias surface without exposing
`vaultspec-core`, `/ops/core`, direct writes, raw vault verbs, or client-chosen
capabilities. The backend now has a catalog and a principal-gated preparation
surface agents can call to obtain validated dispatch aliases over existing
authoring command kinds.

The implementation deliberately prepares dispatch instead of executing tool side
effects. That keeps W12.P31 scoped to catalog/schema/alias wiring and leaves
durable permission requests, interrupts, normalized tool-call records, and
end-to-end execution replay to W12.P22 and W12.P32.

## Notes

- Verification:
  - `cargo fmt -p vaultspec-api --manifest-path engine/Cargo.toml`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::tools -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::http::tests::authoring_router_serves_agent_tool_catalog_and_principal_gated_prepare -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring -- --nocapture`
  - `cargo clippy -p vaultspec-api --manifest-path engine/Cargo.toml --all-targets -- -D warnings`
- Focused tool tests passed 11 tests.
- The route-level tool catalog/prepare test passed.
- The broader authoring slice passed 333 tests.
- Clippy passed with `-D warnings`.
- Test-owned temporary `vaultspec serve` children logged watcher warnings after
  temporary roots were removed; detached workspace server children are stopped
  after verification.
