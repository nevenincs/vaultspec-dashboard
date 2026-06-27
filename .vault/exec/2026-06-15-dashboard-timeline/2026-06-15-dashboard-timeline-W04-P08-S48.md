---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S48'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Reuse the tier dial in the control bar with semantic inapplicable in time-travel

## Scope

- `frontend/src/app/timeline/TimelineControls.tsx`

## Description

- Reuse the existing stage tier dial directly in the control bar (declared/structural/temporal/semantic) rather than reinventing it.
- The dial already reads the shared timeline mode and renders the semantic tier INAPPLICABLE in time-travel (disabled, designed state) and OFFLINE when rag is down; compose it unchanged.

## Outcome

The tier dial renders inside the control bar; in time-travel mode the semantic tier reads its inapplicable state. Verified by a component test that sets time-travel mode and asserts the semantic switch is disabled with the inapplicable data-state, confirming the reused dial honors the shared mode.

## Notes

No edit to the tier dial was needed: it already reads time-travel mode and degradation through its own stores selectors, so composing it satisfies the semantic-inapplicable contract with zero new code.
