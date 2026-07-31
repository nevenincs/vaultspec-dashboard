---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:1b6e731f79e47fe848dfceb24fe9ca06a66465df408d6725b1603ad3dc9883c7'
step_id: 'S38'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---

# Unit-test composition sequencing keeps every lens viewable in every mode

## Scope

- `frontend/src/stores/view/composition.test.ts`

## Description

## Outcome

Added `composition.test.ts`: requery-then-relayout on lens, relayout-only on mode, requery-first when both change, no-op when unchanged, and EVERY lens viewable in EVERY mode (no forbidden combination). 6 tests green.

## Notes
