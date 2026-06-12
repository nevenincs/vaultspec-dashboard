---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S45'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement the events verb with from, to, kinds and bucket flags matching the contract event shape

## Scope

- `engine/crates/vaultspec-cli/src/cmd/events.rs`

## Description

- Implement the events verb: live commit walk from the scope HEAD into contract-shaped rows (stable id, ms timestamps, node-id correlation including the commit node), kind and range filtering, raw/auto/fixed bucketing via the shared bucketing core.

## Outcome

Contract section 5 event shape from the one-shot front door; live-verified with daily bucketing.

## Notes

The persisted event log remains the serve mode's accumulator; the one-shot verb computes live (cold start is a feature).
