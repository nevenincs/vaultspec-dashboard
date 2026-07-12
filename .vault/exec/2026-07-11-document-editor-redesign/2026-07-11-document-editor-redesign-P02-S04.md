---
tags:
  - '#exec'
  - '#document-editor-redesign'
date: '2026-07-11'
modified: '2026-07-11'
step_id: 'S04'
related:
  - "[[2026-07-11-document-editor-redesign-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace document-editor-redesign with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S04 and 2026-07-11-document-editor-redesign-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Build the vertical Properties form inside the popover: read-only directory-tag row, single-select Feature combobox over the existing feature-tag set, and a validated Date field, saved through useSetFrontmatter and ## Scope

- `frontend/src/app/viewer/PropertiesPopover.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
