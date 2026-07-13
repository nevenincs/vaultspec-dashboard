---
tags:
  - '#plan'
  - '#rag-affordance-adoption'
date: '2026-06-27'
modified: '2026-07-12'
tier: L2
related:
  - '[[2026-06-27-rag-affordance-adoption-adr]]'
  - '[[2026-06-27-rag-affordance-adoption-research]]'
---
# `rag-affordance-adoption` plan

Adopt rag's machine-global discovery pointer (a new discovery candidate) and its idempotent JSON start (version-tolerant, with rag's authoritative failure reason).

### Phase `P01` - adopt the machine-global discovery pointer

Add the storage-parent pointer as the first discovery candidate, additive and tolerant (ADR D1).

- [x] `P01.S01` - Prepend the storage-parent machine-global pointer to service_json_candidates and update the precedence comment; `engine/crates/rag-client/src/client.rs`.
- [x] `P01.S02` - Unit-test that the machine-global pointer is the first candidate and an absent pointer is skipped; `engine/crates/rag-client/src/client.rs`.

### Phase `P02` - version-tolerant JSON start with authoritative failure reason

Append --json to the start, fall back when an older rag rejects it, and surface rag's stated failure reason (ADR D2, D3).

- [x] `P02.S03` - Append --json in rag_start_args; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `P02.S04` - Detect an older rag rejecting --json on the spawn path and retry the start without it; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `P02.S05` - Parse rag's structured failure envelope on a genuine non-zero exit and surface the stated reason, degrading to the re-probe otherwise; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `P02.S06` - Unit-test the unknown-option detection and the structured-reason extraction over JSON fixtures; `engine/crates/vaultspec-api/src/routes/ops.rs`.

## Description

Adopt the two broker-facing affordances rag shipped, per the accepted ADR. Phase P01 adds
rag's STATUS_DIR-independent machine-global pointer
(`~/.vaultspec-rag/qdrant-server/service.json`) as the FIRST candidate in
`service_json_candidates` (`rag-client/client.rs`), with the precedence comment updated to
record the previously-deferred pointer is now adopted; it is purely additive (a missing
candidate is skipped). Phase P02 adopts rag's idempotent `server start --json` in
`vaultspec-api/routes/ops.rs`: append `--json` in `rag_start_args`, and on the spawn path
make it VERSION-TOLERANT - if an older rag rejects the unknown `--json` option the start
retries without it - then on a genuine non-zero exit parse rag's `{ok:false, error, data}`
envelope to surface the stated failure reason (`machine_owned` holder pid, `port_in_use`,
`qdrant_missing`), degrading to the existing bounded re-probe inference otherwise. Both land
in one PR safe to merge against any rag version (no release ordering). Grounded in the
`rag-affordance-adoption` research and ADR; consumes the rag `rag-broker-affordances` change.

## Steps

## Parallelization

P01 and P02 are independent (different crates: `rag-client` vs `vaultspec-api`) and can be
done in either order; they are executed P01 then P02 for a clean review. Within P02, S03
(append `--json`) precedes S04 (the fallback) and S05 (the reason extraction), with S06
(tests) last. The test steps (S02, S06) gate their phase's completion.

## Verification

The plan is complete when every Step is closed and these criteria hold:

- `service_json_candidates` returns the storage-parent machine-global pointer FIRST, ahead
  of the STATUS_DIR file and the per-scope fallback; an absent pointer is skipped by
  `discover_at` (unit tests).
- `rag_start_args` includes `--json`; the spawn path retries the start WITHOUT `--json` when
  an older rag rejects the unknown option (detected from the captured output), so the
  adoption never breaks against a rag that predates the flag (unit test of the detection).
- On a genuine non-zero start exit, rag's `{ok:false, error, data}` envelope is parsed and
  the stated reason (`machine_owned`/`port_in_use`/`qdrant_missing`) is surfaced; a
  non-envelope output degrades to the existing re-probe inference (unit tests over JSON
  fixtures).
- The engine's probe-first attach (`already_running` without calling start) is unchanged.
- `cargo fmt --check`, `cargo clippy --workspace --all-targets -D warnings`, and
  `cargo test` are green; `vaultspec-core vault check all` stays clean.
