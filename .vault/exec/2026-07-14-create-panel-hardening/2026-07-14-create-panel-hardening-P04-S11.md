---
tags:
  - '#exec'
  - '#create-panel-hardening'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S11'
related:
  - "[[2026-07-14-create-panel-hardening-plan]]"
---

# Add the one-click prerequisite affordance on ineligible type rows: activating the reason selects and focuses the missing upstream type (ADR D3's promised path)

## Scope

- `frontend/src/app/left/CreateDocDialog.tsx`

## Description

- Implement the one-click prerequisite path (ADR D3's promised affordance): activating an ineligible type row walks the served reason chain (plan -> decision record -> research/reference) to the first ELIGIBLE upstream type and selects + focuses it, instead of a dead no-op.

## Outcome

Locked by a live-engine test (selection moved to audit first so the routing is observable). The reachable aria-disabled rows from P02 make the affordance keyboard-operable for free.

## Notes

The chain walk is bounded (three hops, the pipeline's depth) and reads only served notes - no client recomputation of the hierarchy gate.
