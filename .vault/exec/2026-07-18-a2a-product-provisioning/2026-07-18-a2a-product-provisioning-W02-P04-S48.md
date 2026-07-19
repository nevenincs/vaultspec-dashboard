---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S48'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Make cold seat launch reconcile only the receipt-owned A2A gateway before opening the dashboard

## Scope

- `engine/crates/vaultspec-cli/src/cmd/launch.rs`

## Description

- Made the cold seat launch surface the receipt-owned gateway readiness the spawned seat reconciled during its boot (S27), read-only, in the launch result.
- Kept the launcher out of process ownership: it never starts or owns a gateway (ADR D4); it only reflects what the seat reconciled, so the cold launch reconciles ONLY the receipt-owned gateway before the dashboard opens.

## Outcome

The cold launch result carries the reconciled A2A installed plus readiness facts. cli tests (incl. launch decision matrix) plus clippy green.

## Notes

None.
