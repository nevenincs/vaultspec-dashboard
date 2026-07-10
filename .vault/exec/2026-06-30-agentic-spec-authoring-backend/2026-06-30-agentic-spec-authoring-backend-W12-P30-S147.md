---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-07'
modified: '2026-07-07'
step_id: 'S147'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Implement LangGraph runtime adapter, thread mapping, run mapping, checkpoint reference storage, and runtime error mapping

## Scope

- `engine/crates/vaultspec-api/src/authoring/langgraph.rs`

## Description

- Add the `authoring::langgraph` module and register it from the fenced
  authoring module tree.
- Add a narrow LangGraph runtime adapter boundary with explicit unavailable
  runtime handling and redacted runtime error mapping.
- Add runtime-created thread, run, and checkpoint capture DTOs that store only
  typed LangGraph references.
- Add store mapping functions that attach runtime thread refs to existing
  sessions, runtime run refs to existing runs, and checkpoint refs to existing
  runs through one explicit unit of work.
- Add an internal `MapLangGraphRuntime` command classification for runtime
  reference attachment.
- Extend the session repository with adapter-owned LangGraph ref attachment
  methods that update existing session, run, and prompt-turn records while
  rejecting conflicting thread/run identities.
- Run formatting, package check, clippy, and the authoring test slice.

## Outcome

The LangGraph runtime mapping boundary now exists without introducing a public
core-shaped endpoint or a direct LangGraph HTTP dependency. Runtime references
can be captured into Vaultspec-owned session/run records, but checkpoint ids
remain correlation fields only and raw checkpoint/event payloads are not stored
as product history.

The implementation deliberately keeps the live Agent Server client narrow:
`LangGraphRuntimeAdapter` validates availability and exposes capture methods for
runtime-created references. Binding those methods to a real fixture or transport
client remains sequenced to the later W12 fixture/tool phases.

## Notes

- Verification:
  - `cargo fmt -p vaultspec-api --manifest-path engine/Cargo.toml`
  - `cargo check -p vaultspec-api --manifest-path engine/Cargo.toml`
  - `cargo clippy -p vaultspec-api --manifest-path engine/Cargo.toml --all-targets -- -D warnings`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring -- --nocapture`
- The broader authoring test run passed 318 tests. Test-owned temporary
  `vaultspec serve` children again logged watcher warnings after temporary roots
  were removed; detached workspace server children were stopped after the run.
- `W12.P30.S148` still owns focused runtime mapping tests for unavailable
  runtime, thread creation, run references, checkpoint references, and redacted
  runtime errors.
