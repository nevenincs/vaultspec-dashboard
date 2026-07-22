---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S96'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Render install, start, stop, restart, repair, update, rollback, remove, doctor, progress, ownership, and remediation from the lifecycle store projection

## Scope

- `frontend/src/app/panels/A2aLifecyclePanel.tsx`

## Description

- Added the agent-service lifecycle control panel, split like `ProvisionPanel`: a dumb, props-driven `A2aLifecyclePanelBody` and a thin wired `A2aLifecyclePanel` wrapper.
- The wrapper reads the stores hooks and memoizes `deriveA2aLifecycleView` in one `useMemo` (never a fresh reference per render).
- The body renders Status (readiness dot + word + active generation), Orchestration (availability + ownership, served reason surfaced as an authored title tooltip), Actions (eligible ops), and Diagnostics (doctor); destructive ops (remove/rollback) open a `ConfirmDialog` before dispatch.

## Outcome

Every displayed value is backend-served; the eligible-op set is a UX affordance hint and the engine refuses authoritatively. All copy resolves through the localization catalog; the panel fetches nothing and reads no raw tiers. Gate green.

## Notes

The served orchestration reason may carry product-internal wording, so it is shown via `authoredDisplayText` as a title tooltip (the sanctioned escape the Team selector uses), never as raw visible copy.
