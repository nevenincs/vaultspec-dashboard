---
tags:
  - '#plan'
  - '#rag-storage-broker'
date: '2026-06-27'
modified: '2026-06-27'
tier: L2
related:
  - '[[2026-06-27-rag-storage-broker-adr]]'
---

# `rag-storage-broker` plan

Broker rag's destructive storage verbs (delete/prune/migrate) through the bounded CLI runner with validated arguments, dry-run-default, and exit-1 envelope forwarding.

### Phase `P01` - the destructive-storage broker primitives

Add the storage CLI whitelist, the validated-argument assembly with the prefix/backend/apply guards, and the storage-aware stdout-inspecting runner (ADR D1, D2, D4).

- [x] `P01.S01` - Add the RAG_STORAGE_CLI_WHITELIST mapping storage-delete, storage-prune, and storage-migrate to their fixed rag base args; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `P01.S02` - Add a validate_namespace_prefix guard rejecting any value that is not rag's canonical r-hash prefix; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `P01.S03` - Implement storage_args_for assembling the validated argv per verb (prefix for delete, active-cell root and to-backend enum for migrate, the dry-run or yes flag from apply); `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `P01.S04` - Implement a storage-aware bounded runner that forwards the rag ok-and-command envelope verbatim on a non-zero preview exit and 502s only a genuine fault; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `P01.S05` - Unit-test the prefix guard, the argv assembly per verb, and the runner envelope-forwarding-on-exit-1 versus 502-on-fault; `engine/crates/vaultspec-api/src/routes/ops.rs`.

### Phase `P02` - the brokered route and dry-run gating

Wire the destructive verbs into a validated route with dry-run-default/explicit-apply and machine-scoped framing, with tests (ADR D3, D5).

- [x] `P02.S06` - Add the ops_rag_storage route validating the body, gating apply to --yes versus the default --dry-run, and running the storage-aware runner; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `P02.S07` - Register the storage route in the router and the brokered ops namespace; `engine/crates/vaultspec-api/src/lib.rs`.
- [x] `P02.S08` - Add route-level tests asserting an unknown verb 403s, a malformed prefix 400s, the default request previews, and an apply request passes yes; `engine/crates/vaultspec-api/src/routes/ops.rs`.

## Description

Add the destructive storage verbs to the engine's brokered surface through the bounded
CLI subprocess runner, per the accepted ADR. Phase P01 builds the primitives in
`routes/ops.rs`: a `RAG_STORAGE_CLI_WHITELIST` for `storage-delete`/`storage-prune`/
`storage-migrate`, a `validate_namespace_prefix` guard (rag's canonical `^r[0-9a-f]{12}_$`),
a `storage_args_for` argv assembler (the validated prefix for delete; the active-cell root
and `server|local` enum for migrate; `--dry-run` by default or `--yes` on apply), and a
storage-aware bounded runner that forwards rag's `{ok, command, data}` envelope verbatim on
a non-zero preview exit and 502s only a genuine fault - all unit-tested. Phase P02 wires the
validated route with dry-run-default / explicit-apply gating and machine-scoped framing,
registers it, and adds the route tests (unknown verb 403, malformed prefix 400, default
preview, apply passes `--yes`). Grounded in the `rag-storage-broker` research and ADR;
completes the storage-management surface (survey -> preview -> reclaim) the
`rag-service-management` survey read opened, and closes the original cross-project audit's
"see but cannot act" gap.

## Steps

## Parallelization

P01 must land before P02: the route consumes the whitelist, the validator, the argv
assembler, and the runner P01 builds. Within P01, the whitelist (S01) and prefix guard
(S02) are independent; `storage_args_for` (S03) consumes both; the runner (S04) is
independent of them; S05 tests all four. Within P02, the route (S06) and its registration
(S07) are one cohesive change, with S08 (route tests) closing the phase. The test steps
(S05, S08) gate their phase's completion.

## Verification

The plan is complete when every Step is closed and these criteria hold:

- `validate_namespace_prefix` accepts rag's canonical `r{12-hex}_` and rejects anything
  else (a non-matching string, a `-`-prefixed option, an empty value), 400-ing before any
  subprocess (unit tests).
- `storage_args_for` assembles the exact argv per verb: `delete` carries the validated
  prefix; `migrate` carries the active-cell root and the `server|local` enum; every verb
  carries `--dry-run` by default and `--yes` only when apply is set; `--json` is always
  present and `--allow-unknown` is never assembled (unit tests).
- The storage-aware runner forwards rag's `{ok, command, ...}` envelope verbatim on a
  non-zero (preview) exit and returns a 502 only for an unparseable/empty stdout with a
  non-zero exit, a spawn failure, or a timeout (unit tests with injected short bounds).
- The route 403s an unknown verb and 400s a malformed prefix before any subprocess, passes
  `--dry-run` by default, and passes `--yes` on an explicit apply (route tests).
- delete/prune are machine-scoped (no `project_root` derivation); migrate sources its root
  from the active cell (verified by the argv assembly).
- `cargo fmt --check`, `cargo clippy --workspace --all-targets -D warnings`, and
  `cargo test` are green on the engine workspace; `vaultspec-core vault check all` stays
  clean.
