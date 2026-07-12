---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S15'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# Grow the adverse and conformance suites with the new boot matrix: seat conflict fails loud, dead-pid takeover succeeds, no-seat exemption writes no machine discovery, empty-registry boot serves onboarding, graceful shutdown cleans discovery

## Scope

- `engine/crates/vaultspec-api/tests/`

## Description

- Add `engine/crates/vaultspec-cli/tests/seat_matrix.rs` over the real binary (`CARGO_BIN_EXE_vaultspec`) with per-test isolated `VAULTSPEC_APP_HOME`: workspace-less boot serves onboarding (empty registry, bootstrap present, tokenless shutdown refused, graceful shutdown retracts discovery and exits 0); second seated serve fails loud naming the seat and leaves the live discovery untouched, then dead-pid takeover republishes; exempt serves keep fail-loud and write no machine discovery and never bootstrap.

## Outcome

3/3 process-level boot-matrix tests green in ~2.5 s.

## Notes

Children are kill-on-drop so a failing assertion can never leak a resident serve into the test host.
