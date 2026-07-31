---
tags:
  - '#exec'
  - '#dashboard-settings'
date: '2026-06-15'
modified: '2026-07-12'
body_hash: 'sha256:b277af2bf1510d03605cab84bde6ac589b751778569a190eaefc934a1ea3db86'
step_id: 'S34'
related:
  - "[[2026-06-15-dashboard-settings-plan]]"
---

# Route theme writes through the settings model while updating the pre-paint cache

## Scope

- `frontend/src/platform/theme/useTheme.ts`

## Description

- Routed theme writes through the settings model while applying optimistically through the controller (instant, no flash); AppShell passes the value/setter to the ThemeToggle.

## Outcome

Theme changes persist server-side and apply instantly.

## Notes

The reconcile effect is gated on no in-flight theme write (review revision) to prevent a stale-server revert flash.
