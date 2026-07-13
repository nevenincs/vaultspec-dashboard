---
tags:
  - '#exec'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S14'
related:
  - "[[2026-07-12-touch-selectability-plan]]"
---

# Re-enable selection on combobox and feature-suggestion option data text in the viewer and left-rail pickers

## Scope

- `frontend/src/app/viewer/AutocompleteCombobox.tsx`

## Description

- Add `select-text` to the option primary/secondary column in `AutocompleteCombobox`
- Add `select-text` to the suggestion display and tag spans in `FeatureSearchField`

## Outcome

Both picker option lists render selectable data text. The comboboxes keep their focus-retention `preventDefault()` on option mouse-down (widget-intrinsic blur-race guard); pointer selection therefore starts on press-and-hold within the spans on touch but not from a desktop drag beginning on an option - accepted for transient dropdown surfaces.

## Notes
