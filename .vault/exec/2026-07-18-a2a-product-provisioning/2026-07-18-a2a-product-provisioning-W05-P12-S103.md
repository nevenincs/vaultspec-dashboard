---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S103'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Add the complete localized lifecycle vocabulary, confirmations, progress, ownership, remediation, and data-preservation copy

## Scope

- `frontend/src/locales/en/common.ts`

## Description

- Added the complete localized agent-service vocabulary to the catalog: panel label/actions/unavailable title, description, section headings, install-state and readiness words, ownership, orchestration availability, the ten operation labels, active-generation/progress/outcome copy, the data-preservation assurance, and remove/rollback confirmations.
- Added the matching message-policy roles in a new `messagePolicy.agentService` slice (kept out of the base module to stay under the module-size gate), and registered the keys in the catalog-key contract.

## Outcome

All copy is plain language with no internal vocabulary on screen. Adding it surfaced four legitimate new canonical imperative verbs (Install, Ensure, Run, Revert - Revert also destructive) added to the vocabulary tables, and the prohibited term was reworded. Full localization suite green.

## Notes

The panel LABEL avoids the prohibited internal term (the internal id stays `agent-service`); the visible name is "Agents". Rollback's button reads "Revert" so it leads with a canonical destructive verb.
