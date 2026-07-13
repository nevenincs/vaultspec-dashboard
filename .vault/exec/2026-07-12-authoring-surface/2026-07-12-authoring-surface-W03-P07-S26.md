---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S26'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# Swap the create-dialog feature input to the corpus-fed autocomplete combobox preserving free text for new tags

## Scope

- `frontend/src/app/left/CreateDocDialog.tsx`

## Description

- Swap the create dialog's bare feature input for the shared autocomplete combobox, fed by the same live feature-tag corpus the editor's Feature picker reads.
- Preserve free text so typing a new tag still creates the feature with its first document; keep the empty-corpus create hint.
- Add an optional host-submit hook to the shared combobox: Enter with the suggestion list closed hands off to the surrounding form's submit after committing any typed free text, so the field stays a picker while open yet the dialog still submits.
- Make the dialog's submit read the freshest draft from the store so a just-typed free-text commit is captured on the same Enter.
- Honour the Features-section focus request by focusing the combobox on open.

## Outcome

Feature entry is now corpus-aware in both create paths while new-feature creation stays implicit. Structural render tests (no-scope seeded client) cover the combobox role, the focus request, and free-text commit; a live-engine test asserts the fixture vault's feature tags are suggested.

Modified files:

- `frontend/src/app/left/CreateDocDialog.tsx`
- `frontend/src/app/viewer/AutocompleteCombobox.tsx`
- `frontend/src/app/left/CreateDocDialog.render.test.tsx`

## Notes

The optional host-submit prop on the shared combobox is additive and backward-compatible; the editor's existing pickers pass nothing and keep the pure picker behaviour. Reviewer flag: confirm the submit-reads-fresh-store change is acceptable (it fixes a snapshot-staleness edge on the Enter-commit-then-submit path).
