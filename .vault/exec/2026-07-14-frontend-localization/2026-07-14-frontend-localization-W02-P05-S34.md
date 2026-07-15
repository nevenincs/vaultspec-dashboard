---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S34'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Prove cross-plane action wording parity

## Scope

- `frontend/src/app/reloadCrossPlaneParity.render.test.tsx`

## Description

- Render the production context menu, command palette, and shortcut dialog together.
- Register the production refresh action, provider, global tail, and keybinding hook.
- Verify stable action identity and exact descriptor parity under a real French runtime.
- Prove all three visible planes render the same localized wording without fallback.

## Outcome

The real `reload:refresh-data` action is proven to render `Actualiser les données` identically in menu, palette, and shortcut surfaces while preserving its stable ID and shortcut metadata.

## Verification

- `just dev lint frontend`
- Production integration test, one test
- Independent Sol review approved with no findings

## Notes

No production code or localization allowlist changed. The scanner remains at 1,406 findings.
