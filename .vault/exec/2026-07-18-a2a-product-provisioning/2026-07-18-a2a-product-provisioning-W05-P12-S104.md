---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S104'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Prove the command provider exposes exactly one localized agent-service toggle through the shared action registry

## Scope

- `frontend/src/stores/view/commandProviders/controlPanelsCommandProvider.test.ts`

## Description

- Extended the control-panels command-provider test: proved the provider surfaces the four modal panels plus the review inbox in cluster order, and asserted EXACTLY ONE agent-service toggle under the shared `panel:agent-service` id, flipping to its hide label when the panel is open.

## Outcome

The command provider derives the agent-service toggle automatically from `CONTROL_PANEL_IDS`; the test proves it is enrolled exactly once through the shared action registry, under the `app` family. Green.

## Notes

None.
