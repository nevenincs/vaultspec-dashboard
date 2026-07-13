---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-07'
modified: '2026-07-12'
step_id: 'S148'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Add runtime mapping tests for unavailable runtime, thread creation, run references, checkpoint references, and redacted runtime errors

## Scope

- `engine/crates/vaultspec-api/src/authoring/langgraph.rs`

## Description

- Add focused LangGraph runtime mapping tests for unavailable runtime
  configuration and redacted runtime failures.
- Add a real-store persistence test that maps runtime thread, run, and
  checkpoint refs onto existing Vaultspec session/run records, reopens the
  store, and verifies the recovered snapshot carries references without raw
  checkpoint payloads.
- Add a conflict test that rejects a mismatched runtime thread ref without
  overwriting the stored product state.
- Tighten runtime diagnostic redaction so prompt/body fragments are redacted
  alongside URLs, bearer credentials, tokens, passwords, and secrets.
- Run formatting, focused LangGraph tests, the full authoring test slice, and
  the clippy gate.

## Outcome

Runtime mapping now has real-behavior regression coverage for the S148 surface:
unavailable runtime handling, runtime-created thread capture, run reference
storage, checkpoint reference recovery, conflict preservation, and safe public
error exposure. The tests exercise the real authoring session/store path with a
temporary SQLite store and do not introduce fakes, mocks, skips, or mirrored
business logic.

The redaction assertion now covers prompt/body leakage explicitly, which keeps
runtime diagnostics useful internally while preventing raw transport details,
credentials, or prompt fragments from surfacing through the public error path.

## Notes

- Verification:
  - `cargo fmt -p vaultspec-api --manifest-path engine/Cargo.toml`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::langgraph -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring -- --nocapture`
  - `cargo clippy -p vaultspec-api --manifest-path engine/Cargo.toml --all-targets -- -D warnings`
- Focused LangGraph tests passed 3 tests.
- The broader authoring test slice passed 321 tests. Test-owned temporary
  `vaultspec serve` children logged watcher warnings after temporary roots were
  removed; detached workspace server children were stopped after the run.
- No public LangGraph endpoint, transport client, or raw checkpoint payload
  persistence was added in this test step.
