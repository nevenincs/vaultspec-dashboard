---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S39'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---




# Rebuild the schema-driven settings controls from the binding Switch, Slider, and SegmentedToggle Kit primitives

## Scope

- `frontend/src/app/settings/controls/`

## Description

- Rebuilt the schema-driven settings control kit faithfully to its binding Figma Kit primitives on the canonical Figma radius/elevation scales: the SwitchControl to Kit Switch (137:28), the EnumControl to Kit SegmentedToggle (137:31), the NumberControl to Kit Slider (155:96), and the TextControl alongside them.
- Migrated the SwitchControl pill track to `rounded-fg-pill` and the knob shadow to `shadow-fg-raised`, keeping the knob a perfect circle (`rounded-full`).
- Migrated the EnumControl segmented track and segments to `rounded-fg-xs` and the active-segment cue to `shadow-fg-raised`, and the TextControl field to `rounded-fg-xs`.
- Confirmed the NumberControl slider already read its accent from the semantic accent token and its readout from the canonical `text-label` role utility, so no legacy alias shim remained to migrate.
- Kept the control contract intact: each control speaks the STRING wire value on both ends, decodes/encodes typing at its boundary, exposes the correct ARIA role (switch / radiogroup / slider / textbox), and dispatches through the unchanged control registry.

## Outcome

The control kit now renders on the canonical Figma radius/elevation foundation and stays bound to the Kit primitives, with every control schema-driven through the registry and grayscale-safe by shape. The control render test (6 cases over the real SettingControl dispatch) passes, confirming each control reflects its value, emits the next value, and exposes the right role. All four control files are eslint-clean and prettier-clean.

## Notes

The knob of the switch and the liveness dots stay `rounded-full` (a circle is border-radius 9999px, not the 18px pill token) by design. The shared worktree's concurrent uncommitted scene WIP still fails the full-tree eslint/tsc steps, outside this scope and not introduced here.
