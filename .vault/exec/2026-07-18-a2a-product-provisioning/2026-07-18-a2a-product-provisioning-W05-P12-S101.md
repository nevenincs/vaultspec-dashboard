---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
body_hash: 'sha256:d46937f5e42c2447bdf266ec5ce2339935661cbc4dd4c93b8ce335be619bbef9'
step_id: 'S101'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Mount the A2A lifecycle panel only while its modal is open so closed panels perform no service reads

## Scope

- `frontend/src/app/panels/ControlPanels.tsx`

## Description

- Mounted the `A2aLifecyclePanel` in a `Dialog` in `ControlPanels`, gated on `open === "agent-service"`, titled from the shared vocabulary label.

## Outcome

The panel body (and its lifecycle status read) mount only while the dialog is open; a closed panel performs no service read. Gate green.

## Notes

None.
