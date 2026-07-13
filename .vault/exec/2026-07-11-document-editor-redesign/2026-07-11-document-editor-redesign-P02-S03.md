---
tags:
  - '#exec'
  - '#document-editor-redesign'
date: '2026-07-11'
modified: '2026-07-12'
step_id: 'S03'
related:
  - "[[2026-07-11-document-editor-redesign-plan]]"
---

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
