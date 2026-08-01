---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:9fef34337cfdf960becae920d22f738dcff32f346ff7fdb752f87ff807c51095'
step_id: 'S17'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# Add a forward amendment note stating the per session override layer is rescinded until a real consumer exists, leaving the original clause intact per the clause level amendment convention

## Scope

- `.vault/adr/2026-07-02-agentic-operation-modes-adr.md`

## Description

- Added a dated, clause-level forward-amendment blockquote directly after the `agentic-operation-modes` ADR's Mode-vocabulary paragraph (the clause that names the per-session override), stating the layer is rescinded per `approval-shape-reconciliation` D5, naming the stripped symbols, and restating that the narrowing-only law stays binding for any future reintroduction. The original clause text is left intact per the project's clause-level-amendment convention (a whole-document supersede would hide the amendment from a reader who opens only this document).
- Added a `related:` edge from `2026-07-02-agentic-operation-modes-adr` to `2026-08-01-approval-shape-reconciliation-adr` via `vaultspec-core vault link add`.
- Verified the amended document is clean under `vaultspec-core vault check all`.

## Outcome

`vaultspec-core vault check all` reports no diagnostics for the amended ADR.

Full Phase gate (`W01.P03`, Steps S09-S17): `cargo fmt -p vaultspec-api -- --check` clean; `cargo clippy -p vaultspec-api --all-targets --no-deps` zero warnings; `cargo test -p vaultspec-api` 919 passed, 2 failed. Both failures are confirmed foreign to this Phase: `authoring::documents::tests::missing_documents_fail_loudly` fails identically in isolation from another lane's in-flight edit to `documents.rs` (matches the dispatching brief's known-foreign-red); `authoring::apply::tests::group1::section_edit_indeterminate_kill_after_a_real_landed_write_is_recognized_applied` failed only under full-suite concurrent load (its own diagnostic cites a 2-second subprocess timeout) and passes cleanly in isolation (36.5s). Full grep confirms zero remaining `session_override` / `resolve_effective_mode` / `session_override_is_narrowing` references anywhere under `engine/crates/`.

## Notes

The shared build tree's `CARGO_TARGET_DIR` for `engine-graph` and `ingest-struct` held a corrupted incremental-compilation cache from an interrupted earlier build (both crates built cleanly standalone but `cargo test -p vaultspec-api` repeatedly failed to resolve their `corpus`/`metadata` modules); `cargo clean -p ingest-struct -p engine-graph` cleared it. Unrelated to this Phase's own code.
