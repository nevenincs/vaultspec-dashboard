---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
step_id: 'S10'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Implement the locale preference controller with system resolution and synchronous cache reconciliation

## Scope

- `frontend/src/platform/localization/localeController.ts`
- `frontend/src/platform/localization/runtime.ts`
- `frontend/src/stores/server/queries/settings.ts`
- `frontend/src/stores/server/settingsSelectors.ts`
- `frontend/src/app/settings/settingsEffects.ts`

## Description

- Resolve a bounded cached preference synchronously before runtime initialization.
- Resolve System deterministically from bounded canonical browser preferences.
- Reconcile authoritative store identity through a framework-free, wire-free controller.
- Serialize and coalesce locale changes so the latest request always wins.
- Observe browser language changes only while System is active.
- Fall back quietly to the source locale without rewriting invalid engine history.
- Keep cache, listeners, diagnostics, and HMR lifecycle bounded.

## Outcome

The application starts with the cached locale hint before document binding or React mount,
then reconciles to authoritative engine settings through the existing settings-effects
bridge. Cache and browser language remain hints only. Duplicate reconciliation is
idempotent, System remains persisted as System, and no locale failure becomes visible UI.

## Notes

Independent Sol review found and verified fixes for redundant cache writes and direct
first-paint factory coverage. Fifty production-behavior tests across six focused files and
the full frontend lint recipe passed. TypeScript, targeted ESLint, formatting, scanner,
and diff checks passed. The scanner remained clean at 1,151 findings with no allowlist
change. Tests use real i18n instances, localStorage, and browser events without doubles.
