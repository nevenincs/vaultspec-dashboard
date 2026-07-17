---
tags:
  - '#exec'
  - '#workspace-picker-dialog'
date: '2026-07-15'
modified: '2026-07-17'
step_id: 'S10'
related:
  - "[[2026-07-15-workspace-picker-dialog-plan]]"
---

# Run the full frontend gate (eslint, prettier, tsc, vitest) and confirm exit 0

## Scope

- `frontend/`

## Description

- Run the full frontend lint recipe repeatedly across the phase: eslint,
  prettier, tsc, the localization scanner, the px scanner, token-drift, and
  figma name validation all exit 0 on the final tree
- Run vitest live against the engine: the picker-scoped slice green at every
  checkpoint (223 tests mid-phase; 215 after the label change; 75/75 in the
  reviewer's independent final slice), plus two full-suite runs (3447+ passing)
- The reviewer independently re-ran eslint, prettier, and tsc on every touched
  file as part of the approval

## Outcome

Every gate component the picker can influence exits 0. The one failing recipe
component on the shared tree is module-size, breached exclusively by another
campaign's uncommitted `authoring/approvals.rs` (grew past the 1500-line gate
during this phase and is still growing under its own lane); no picker file
approaches the gate. Splitting or ratchet-baselining foreign mid-flight work
was deliberately not done.

## Notes

- The full suite carries ~12 failures from the parallel localization
  campaign's in-flight platform files, plus one order-sensitive dialog test the
  reviewer attributed to the documented GS-007/TIH-002 shared-engine load-flake
  class (passes in isolation and in scoped batches) — infrastructure, not a
  picker defect.
