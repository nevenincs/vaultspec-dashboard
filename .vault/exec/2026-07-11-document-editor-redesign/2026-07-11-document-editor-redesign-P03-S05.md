---
tags:
  - '#exec'
  - '#document-editor-redesign'
date: '2026-07-11'
modified: '2026-07-12'
step_id: 'S05'
related:
  - "[[2026-07-11-document-editor-redesign-plan]]"
---

# Add the Related multi-select combobox over the corpus with removable Chips persisted as wiki-link stems to the Properties form

## Scope

- `frontend/src/app/viewer/RelatedDocPicker.tsx`

## Description

- Add the shared `AutocompleteCombobox` (kit SearchField + autocomplete listbox,
  Class-B arrow/enter/escape keys in-component) mirroring the rail's canonical
  feature-search field; single/multi and optional free-text modes.
- Add `RelatedDocPicker`: the combobox over the corpus (excluding self and already-
  linked documents) plus removable Badge tokens, persisting selections as comma-joined
  wiki-link stems.
- Add pure `parseRelatedStems` / `serializeRelatedStems` (de-dupe, tolerate `[[ ]]`).
- Render-test add / remove / already-linked exclusion and the parse round-trip.

## Outcome

Delivered. `related` now links only to documents that exist — no dangling links from
typos. Grounded rag-first on the `FeatureSearchField` combobox template. Tests and
gate pass.

## Notes

Options carry an explicit `aria-label` so a screen reader announces the title cleanly
(and the listbox is deterministically queryable) — the nested-span content name did
not compute under happy-dom.
