---
tags:
  - '#exec'
  - '#document-editor-redesign'
date: '2026-07-11'
modified: '2026-07-12'
step_id: 'S04'
related:
  - "[[2026-07-11-document-editor-redesign-plan]]"
---

# Build the vertical Properties form inside the popover: read-only directory-tag row, single-select Feature combobox over the existing feature-tag set, and a validated Date field, saved through useSetFrontmatter

## Scope

- `frontend/src/app/viewer/PropertiesPopover.tsx`

## Description

- Add `PropertiesPopover`: a self-contained trigger IconButton plus an on-demand kit
  `Popover` (Escape / outside-pointer dismiss), closed by default, opening a vertical
  stacked form floating over the full-width body.
- Compose the form from kit atoms: a Name field with Rename, a read-only directory-tag
  `PropertyRow`, a single-select Feature combobox, the Related picker, a validated
  Date field, and Save properties.
- Edit the feature tag through `withFeatureTag`, preserving the directory tag; wire the
  frontmatter/rename mutations from the parent.
- Add the shared `editorTags` helpers and unit-test tag split / directory / feature /
  feature-replace; add popover render tests (closed by default, opens, dismiss, save).

## Outcome

Delivered. Metadata is a deliberate, on-demand, vertical act — never a blocking
column. Grounded rag-first on the `GraphControls` popover pattern. Render/unit tests
and the lint gate pass.

## Notes

The popover edits this document's frontmatter only — it is not a corpus filter
(filtering has one canonical surface).
