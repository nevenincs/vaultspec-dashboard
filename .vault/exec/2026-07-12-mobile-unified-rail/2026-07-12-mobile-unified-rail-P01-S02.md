---
tags:
  - '#exec'
  - '#mobile-unified-rail'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S02'
related:
  - "[[2026-07-12-mobile-unified-rail-plan]]"
---

# Add a view-local fold store for the unified rail's STATUS and BROWSE top-level sections, both expanded by default, Status first

## Scope

- `frontend/src/stores/view/compactRailSections.ts`

## Description

- Add a view-local fold store for the unified rail's STATUS and BROWSE top-level sections, both defaulting open.
- Expose primitive-returning selector hooks and standalone toggle/reset functions mirroring the compact surface store.

## Outcome

The two top-level sections have independent, testable fold state. Delegated to a supervised Opus coder; verified against the consuming component's imports and the stable-selector law.

## Notes

Authored by a delegated Opus coder under orchestrator supervision; the orchestrator owns the gate and the commit.
