---
generated: true
tags:
  - '#index'
  - '#document-editor-redesign'
date: '2026-07-11'
modified: '2026-07-11'
related:
  - '[[2026-07-11-document-editor-redesign-P01-S01]]'
  - '[[2026-07-11-document-editor-redesign-P01-S02]]'
  - '[[2026-07-11-document-editor-redesign-P02-S03]]'
  - '[[2026-07-11-document-editor-redesign-P02-S04]]'
  - '[[2026-07-11-document-editor-redesign-P03-S05]]'
  - '[[2026-07-11-document-editor-redesign-P04-S06]]'
  - '[[2026-07-11-document-editor-redesign-P04-S07]]'
  - '[[2026-07-11-document-editor-redesign-adr]]'
  - '[[2026-07-11-document-editor-redesign-audit]]'
  - '[[2026-07-11-document-editor-redesign-plan]]'
---

# `document-editor-redesign` feature index

Auto-generated index of all documents tagged with `#document-editor-redesign`.

## Documents

### adr

- `2026-07-11-document-editor-redesign-adr` - `document-editor-redesign` adr: `metadata editor, controls, and linking pickers` | (**status:** `accepted`)

### audit

- `2026-07-11-document-editor-redesign-audit` - `document-editor-redesign` audit: `post-execution code review`

### exec

- `2026-07-11-document-editor-redesign-P01-S01` - Add a bounded stores selector exposing the pickable corpus and existing feature-tag set, derived in useMemo from the raw useVaultTree slice
- `2026-07-11-document-editor-redesign-P01-S02` - Add a pure markdown formatting-insertion helper that wraps or line-prefixes the current selection and returns the new body plus caret range
- `2026-07-11-document-editor-redesign-P02-S03` - Replace the permanent PropertiesCard column with an on-demand kit Popover anchored to a Properties toggle button so the body reclaims full width
- `2026-07-11-document-editor-redesign-P02-S04` - Build the vertical Properties form inside the popover: read-only directory-tag row, single-select Feature combobox over the existing feature-tag set, and a validated Date field, saved through useSetFrontmatter
- `2026-07-11-document-editor-redesign-P03-S05` - Add the Related multi-select combobox over the corpus with removable Chips persisted as wiki-link stems to the Properties form
- `2026-07-11-document-editor-redesign-P04-S06` - Add the formatting toolbar of kit IconButtons dispatching the insertion helper and enrolling Save plus the formatting verbs as shared action descriptors through the one keymap registry
- `2026-07-11-document-editor-redesign-P04-S07` - Add a11y attributes and guard/render tests for the toolbar, keymap enrollment, and popover, then run the full frontend lint gate to green

### plan

- `2026-07-11-document-editor-redesign-plan` - `document-editor-redesign` plan
