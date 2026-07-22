---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S106'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Update the control-panel inventory assertion while preserving the three intentional footer chips

## Scope

- `frontend/src/app/right/rail.test.ts`

## Description

- Updated the rail inventory assertion to expect FOUR modal control panels (adding agent-service in cluster order) while preserving the THREE intentional footer chips unchanged.

## Outcome

The inventory guard reflects the new modal identity without disturbing the footer cluster. Green.

## Notes

None.
