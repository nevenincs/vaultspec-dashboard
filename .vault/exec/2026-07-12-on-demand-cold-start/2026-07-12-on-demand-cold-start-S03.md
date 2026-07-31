---
tags:
  - '#exec'
  - '#on-demand-cold-start'
date: '2026-07-12'
modified: '2026-07-12'
body_hash: 'sha256:89b44cfd05fc2c50104ea8559ede16c89fe0df4adcb0af2047e05da94ffaf8ba'
step_id: 'S03'
related:
  - "[[2026-07-12-on-demand-cold-start-plan]]"
---

# Yield briefly between vault-tree continuation pages so the background drain never contends with first paint or first interaction

## Scope

- `frontend/src/stores/server/engine.ts`

## Description

Add a bounded 120ms drainYield between vault-tree continuation pages in `frontend/src/stores/server/engine.ts` (after onPartial, never after the final page), so the background drain never contends with first paint.

## Outcome

Worst-case added latency ~3s at the 26-page cap; the fixture vault (single small first page) sees zero added test time.

## Notes
