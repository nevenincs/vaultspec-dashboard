---
tags:
  - '#exec'
  - '#document-editor-redesign'
date: '2026-07-11'
modified: '2026-07-12'
step_id: 'S07'
related:
  - "[[2026-07-11-document-editor-redesign-plan]]"
---

# Add a11y attributes and guard/render tests for the toolbar, keymap enrollment, and popover, then run the full frontend lint gate to green

## Scope

- `frontend/src/app/viewer/MarkdownDocView.render.test.tsx`

## Description

- Add ARIA throughout: `role="toolbar"`/`aria-orientation` on the toolbar,
  `role="combobox"`/`listbox`/`option` with `aria-expanded`/`aria-controls`/
  `aria-activedescendant` on the pickers, `role="dialog"` on the properties popover,
  and explicit option `aria-label`s.
- Add render tests for the toolbar (dispatch, one tab stop, disabled), the Related
  picker (add/remove/exclude), and the properties popover (closed-by-default, open,
  feature-edit-preserves-directory-tag, Escape dismiss, save).
- Run the full frontend gate: eslint, prettier `--check`, `tsc -b`, and `lint:px`.

## Outcome

Delivered. The whole `viewer` suite (13 files, 73 tests) is green with no regressions,
and the full lint gate exits clean (eslint / prettier / tsc / px all clean).

## Notes

Live browser verification against the running SPA is recommended as a final visual
confirmation but was not run in this session.
