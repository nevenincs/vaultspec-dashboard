---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S99'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Define localized agent-service labels, toggle actions, and unavailable title in the canonical control-panel vocabulary

## Scope

- `frontend/src/stores/view/controlPanelVocabulary.ts`

## Description

- Added the `agent-service` entry to the canonical control-panel vocabulary: label, show/hide toggle labels, and unavailable title, with the typed key unions extended and the runtime `controlPanelVocabulary` guard updated.

## Outcome

TypeScript exhaustiveness (`satisfies ControlPanelVocabularyMap`) forces the entry to exist for the new id. Gate green.

## Notes

None.
