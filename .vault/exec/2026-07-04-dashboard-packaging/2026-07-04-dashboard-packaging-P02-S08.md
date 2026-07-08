---
tags:
  - '#exec'
  - '#dashboard-packaging'
date: '2026-07-04'
modified: '2026-07-04'
step_id: 'S08'
related:
  - "[[2026-07-04-dashboard-packaging-plan]]"
---

# surface the component handshake (declared floors, probed versions, degraded flags for core and rag) through the served tiers envelope

## Scope

- `engine/crates/vaultspec-api`

## Description

- Add `handshake::decorate_tiers`: the `declared` tier gains a `component` block naming `vaultspec-core`, its floor (0.1.36), the probed version, and the served `meets_floor` verdict; the `semantic` tier gains the `vaultspec-rag` component with floor 0.2.28 and an honestly null version (rag's discovery file reports none)
- Route ALL three tiers builders (`query_tiers`, `degraded_tiers`, `degraded_tiers_for`) through one `tiers_value` helper that serializes the engine-query block and decorates it, so success and error envelopes alike carry the handshake
- Availability and reasons stay exactly what the tier computation said; decoration is additive and memoized (no subprocess on the hot path after first probe)

## Outcome

`cargo test -p vaultspec-api --lib` passes 380 (374 prior + 5 handshake unit tests + 1 wire test); the wire test asserts a served `/status` response carries both component blocks with the declared floors and a boolean-or-null verdict. `rustfmt --check` clean on the three touched files; clippy reports nothing on them. The conformance suite's tiers assertions are presence-based, so the additive field is contract-safe.

## Notes

- Changing the tiers shape is a contract event per the wire-contract rule; it is the deliberate, ADR-decided D6 mechanism (additive fields, tolerant adapters), not incidental drift.
- Review revision: the underlying `core_version()` probe in `engine/crates/ingest-core/src/runner.rs` was rebounded (64 KiB cap + 30 s deadline + kill, the capability-probe pattern) because the startup gate promoted it onto the serve critical path where an unbounded child could hang startup.
- Conscious exclusion, recorded per review: the ungated `/health` liveness body and the as-of/temporal envelopes serialize tiers without the component block - the handshake describes present-machine component state, which historical as-of reads and the static liveness probe do not carry. A component-less block degrades gracefully by test.
