---
tags:
  - '#exec'
  - '#advanced-service-console'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:058e2f7fc5831aedbcf195ad17c50c2ea9814befe716f71607d2d53cb7b8417d'
step_id: 'S04'
related:
  - "[[2026-08-01-advanced-service-console-plan]]"
---

# Remove FrameworkStatusCluster and its ControlPanels plumbing from user chrome in the same change, keep a minimal user-facing approvals affordance, and re-point palette commands

## Scope

- `frontend/src/app/right`
- `frontend/src/app/AppShell.tsx`
- `frontend/src/stores/view`

## Description

- Delete the modal control-panel host, its view store, its vocabulary module, its command provider, and their tests, in the same change that gives their surfaces a new home.
- Drop the host from both shell branches so no floating panel mounts anywhere in the product chrome.
- Narrow the rail-footer cluster to the pending-changes affordance and the collapsed-agent chip, deleting the per-panel chips, tones, and toggle plumbing.
- Collapse the four retired per-panel action descriptors into the one Advanced-settings verb, and enrol it through a pure provider in the one command registry.
- Re-point the guards: assert the new action is enrolled AND that all four retired panel ids are absent from the palette, that the rail hosts none of the console ids, and that a retired id normalizes to nothing at the boundary.

## Outcome

Removal and rehoming landed as ONE change, so no affordance was orphaned and no legacy alias survives. The four retired panel ids resolve to nothing anywhere - palette, keymap, rail, or boundary - and the guards that prove it can still go red. The approvals chip survives as the one user-facing element, driven by the same shared descriptor the palette composes, because the review queue feeds the authoring workflow rather than reporting a tool's health.

## Notes

The cluster file survives under its old name while carrying only the approvals affordance; its header comment records the narrowing. Renaming it belongs to the agent campaign that owns this affordance's final form.

The locale-key namespace the retired panels used survives because its tone and label leaves are actively consumed by the Advanced folds and the narrowed cluster. That is a repurposed key prefix, not a dangling reference.
