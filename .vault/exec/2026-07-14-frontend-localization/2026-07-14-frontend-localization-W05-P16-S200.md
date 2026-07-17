---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S200'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize settings control labels, options, validation, and accessible descriptions

## Scope

- `frontend/src/app/settings/controls/`

## Description

- Verified `KeybindingControl.tsx` resolves its labels, guidance, and conflict copy
  through `useLocalizedMessage` over typed descriptors (16 call sites, already ticked
  under `W02.P05.S248`).
- Verified `EnumControl.tsx`, `NumberControl.tsx`, `SwitchControl.tsx`,
  `TextControl.tsx`, and `registry.tsx` are pure prop-driven primitives with no owned
  strings — `label`, options, and validation copy are entirely caller-supplied,
  consistent with the schema-driven settings design (labels sourced from the engine
  settings schema, resolved at the boundary in `settingsControls.ts`,
  `W05.P16.S90`).
- Ran the bounded localization scanner against every non-test file in the folder and
  confirmed zero exact findings.

## Outcome

The settings control library carries no unlocalized copy: the one typed control
(`KeybindingControl`) resolves descriptors directly, and every other control is a pure
display primitive over caller-supplied, already-localized data.

## Notes

Reconciliation pass (bookkeeping only, no code changes). This record retroactively
documents and ticks the plan step; verification was file inspection plus a scoped
scanner run across the full folder, not a fresh implementation.
