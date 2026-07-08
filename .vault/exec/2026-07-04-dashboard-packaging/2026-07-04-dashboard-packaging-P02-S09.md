---
tags:
  - '#exec'
  - '#dashboard-packaging'
date: '2026-07-04'
modified: '2026-07-04'
step_id: 'S09'
related:
  - "[[2026-07-04-dashboard-packaging-plan]]"
---

# add engine tests proving missing git, stale core, and absent rag each degrade honestly in the tiers block

## Scope

- `engine/crates/vaultspec-api`

## Description

- Handshake unit tests: a nonexistent binary probes unavailable (the clean-machine missing-git path); the gate fails closed with the git remediation and the exact `uv tool install vaultspec-core` command; a below-floor core (0.1.34) passes the gate and fails the floor while 0.1.36 meets it; tiers decoration declares both floors and never touches availability or reasons
- Wire test `served_tiers_carry_the_component_handshake`: a fixture workspace (no rag service) serves `/status` with semantic truthfully unavailable alongside its component block, the core component carrying floor 0.1.36 and a served boolean-or-null verdict

## Outcome

All six tests green in `cargo test -p vaultspec-api --lib` (380 total). Missing git and missing core are exercised through the parameterized pure gate (probe injection, not engine-wire mocking); absent rag is exercised against the real served wire off the fixture workspace.

## Notes

- A live serve boot with the gate active is re-verified end to end by the P03.S15 packaged-artifact dry run.
