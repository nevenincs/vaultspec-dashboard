---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S09'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement remote-ref mapping flagged with degraded tiers (declared and temporal only, no working tree)

## Scope

- `engine/crates/ingest-git/src/branches.rs`

## Description

- Implement remote-ref mapping: remote branches enumerate as refs only, each flagged with the tiers the scope cannot serve (structural and semantic - no working tree to resolve against).
- Skip the origin HEAD pointer; classify by the branch name behind the remote prefix.
- Test against a clone fixture asserting degraded-tier flags and classification.

## Outcome

Remote refs degrade to declared + temporal per ADR D2.2: degrade, don't demand. The degradation is data on the `BranchInfo`, ready for the contract's per-response tier block.

## Notes

None.
