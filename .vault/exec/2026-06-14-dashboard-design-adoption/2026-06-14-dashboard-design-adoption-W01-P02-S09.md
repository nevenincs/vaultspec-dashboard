---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S09'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---

# Implement system auto-switch plus manual theme override in the platform/app theme controller, without adopting the dark: utility variant

## Scope

- `frontend/src/platform`

## Description

- Implement the theme controller in the platform substrate as a framework-free primitive that owns the data-theme attribute on the document element, localStorage persistence, and OS media listening.
- Model preference as either system auto-switch or a pinned theme; resolve system by following prefers-color-scheme and upgrading to high-contrast when prefers-contrast: more is set.
- Add a thin React hook over the controller (useSyncExternalStore) and export both from the platform barrel.
- Initialize the controller at app boot before first paint so the document element carries data-theme without a flash, and replace the old two-state toggle in the chrome with a system/light/dark/high-contrast preference cycle.
- Avoid the dark: utility variant entirely; the variable-remap model is the single theming mechanism.

## Outcome

System auto-switch plus manual override is live and lives in the platform layer (the substrate), not the chrome. The chrome button only cycles the preference and never touches data-theme directly. Eight unit tests cover resolution, pinning, OS-flip following, persistence, hydration, and change-notification.

## Notes

The controller is framework-free per the platform substrate convention; the React surface is a separate thin hook. The old chrome ThemeToggle manipulated the document element directly - that ownership moved into the controller so the chrome stays a dumb view (layer-ownership discipline).
