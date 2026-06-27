---
tags:
  - '#exec'
  - '#management-engine-optimization'
date: '2026-06-17'
modified: '2026-06-17'
step_id: 'S02'
related:
  - "[[2026-06-17-management-engine-optimization-plan]]"
---

# Constrain salience scale benchmarking

## Scope

- `engine/crates/engine-query/benches/salience_bench.rs`

## Description

- Keep the salience feasibility bench pinned to the graph query node ceiling.
- Fail loud when `VAULTSPEC_SALIENCE_NODES` exceeds the bounded query ceiling.
- Preserve the existing wall-clock evidence output for Brandes, full basis build, and
  warm per-request composition.

## Outcome

The salience bench remains tunable below the ceiling but can no longer be used to claim
unsupported above-ceiling feasibility. The default run still measures the full 5000-node
ceiling case.

## Notes

Verification:

- `cargo bench -p engine-query --bench salience_bench`
