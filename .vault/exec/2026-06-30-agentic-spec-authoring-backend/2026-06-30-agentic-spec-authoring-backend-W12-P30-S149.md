---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-07'
modified: '2026-07-12'
step_id: 'S149'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Run LangGraph runtime mapping code review and record the phase audit

## Scope

- `.vault/audit/`

## Description

- Run the S149 LangGraph runtime mapping review against the W12.P30 checklist,
  the S146/S147/S148 execution records, and the implemented adapter/session/API
  surfaces.
- Dispatch a dedicated code-review sidecar to independently inspect the runtime
  mapping boundary, product-authority split, raw payload handling, command
  classification, error taxonomy, and tests.
- Resolve the high public-command boundary finding by removing client-supplied
  `langgraph` refs from create/start request DTOs and fixtures.
- Resolve the session-level authority finding by keeping session LangGraph refs
  thread-scoped while run/checkpoint refs stay on run and turn records.
- Resolve the error-taxonomy finding by mapping deterministic LangGraph ref
  conflicts to `InvalidReference`.
- Resolve the redaction residual by redacting separated bearer, authorization,
  prompt, and body values in runtime diagnostics.
- Append the S149 findings and resolutions to the rolling feature audit.
- Run focused LangGraph tests, the public API unknown-field regression, the
  broader authoring test slice, and clippy.

## Outcome

The S149 review found one high issue, two medium issues, and one low residual
risk. All were fixed before closing the row. The public command boundary no
longer lets clients author LangGraph refs, session refs no longer make runtime
run ids session authority, deterministic runtime ref conflicts are typed as
invalid references, and redaction covers separated credential/prompt forms.

The audit log records each finding as resolved. No new public LangGraph route,
transport dependency, raw checkpoint payload persistence, direct `.vault/`
write, or core-shaped authoring endpoint was introduced.

## Notes

- Verification:
  - `cargo fmt -p vaultspec-api --manifest-path engine/Cargo.toml`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::langgraph -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::api::tests::nested_authoring_context_rejects_unknown_fields -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring -- --nocapture`
  - `cargo clippy -p vaultspec-api --manifest-path engine/Cargo.toml --all-targets -- -D warnings`
- Focused LangGraph tests passed 3 tests.
- The API unknown-field regression passed 1 test.
- The broader authoring test slice passed 321 tests.
- Test-owned temporary `vaultspec serve` children logged watcher warnings after
  temporary roots were removed; detached workspace server children were stopped
  after the run.
