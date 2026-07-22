---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S97'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Prove cold, owned, foreign, updating, rollback, degraded, and destructive-confirmation presentations using the production panel component

## Scope

- `frontend/src/app/panels/A2aLifecyclePanel.render.test.tsx`

## Description

- Added the panel render test exercising the production `A2aLifecyclePanelBody` with constructed views and the REAL localization runtime (isolated view data, the permitted carve-out).
- Covered cold (running-idle + process control), owned (managed by this app), foreign (orchestration unavailable + managed elsewhere + title tooltip, no raw reason), updating/busy (progress), rollback + remove (destructive confirmation gating), degraded recovery-required, and job-outcome presentations.

## Outcome

Ten tests green. Destructive ops dispatch ONLY after the confirm is accepted; cancelling never dispatches. The served reason is proven present as a title attribute and absent from visible text.

## Notes

None.
