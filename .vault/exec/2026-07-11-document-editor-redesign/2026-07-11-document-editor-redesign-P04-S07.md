---
tags:
  - '#exec'
  - '#document-editor-redesign'
date: '2026-07-11'
modified: '2026-07-11'
step_id: 'S07'
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
     The S07 and 2026-07-11-document-editor-redesign-plan placeholders are machine-filled by
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
     The Add a11y attributes and guard/render tests for the toolbar, keymap enrollment, and popover, then run the full frontend lint gate to green and ## Scope

- `frontend/src/app/viewer/MarkdownDocView.render.test.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
