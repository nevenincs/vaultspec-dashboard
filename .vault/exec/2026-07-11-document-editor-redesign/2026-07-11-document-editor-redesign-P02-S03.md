---
tags:
  - '#exec'
  - '#document-editor-redesign'
date: '2026-07-11'
modified: '2026-07-11'
step_id: 'S03'
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
     The S03 and 2026-07-11-document-editor-redesign-plan placeholders are machine-filled by
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
     The Replace the permanent PropertiesCard column with an on-demand kit Popover anchored to a Properties toggle button so the body reclaims full width and ## Scope

- `frontend/src/app/viewer/MarkdownDocView.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Replace the permanent PropertiesCard column with an on-demand kit Popover anchored to a Properties toggle button so the body reclaims full width

## Scope

- `frontend/src/app/viewer/MarkdownDocView.tsx`

## Description

- Remove the permanent 256px `PropertiesCard` right column and the local
  `PropertiesCard` / `Field` components; the body textarea now fills the full width.
- Rebuild the editor action bar: status label, the formatting toolbar, a vertical
  divider, the on-demand `PropertiesPopover`, then Save / Done. Move the rename
  control off the bar into the popover.
- Wire formatting: forward a textarea ref through `HighlightedTextarea`, apply a
  command to the live selection, and restore the caret range in a layout effect
  after the draft re-render; add the Class-B Mod+B/I/K accelerators on the textarea.
- Centralize `featureFromDocTags` onto the shared `editorTags` helpers (re-exported
  so the existing autofix-derivation test still binds).

## Outcome

Delivered. Edit mode is a full-width writing surface with no permanent metadata
column; the properties surface is opened on demand. Render tests and the full lint
gate pass.

## Notes

The textarea forwards a ref (for toolbar selection reads) but carries no bespoke
formatting keydown handler: formatting is toolbar-only. Code review caught an early
draft that DID add Mod+B/I/K accelerators on the textarea — those collide with and
would swallow the Class-A globals (Mod+K command palette, Mod+B left-rail toggle), so
they were removed. Save stays the one keymap-registry binding and bubbles normally.
