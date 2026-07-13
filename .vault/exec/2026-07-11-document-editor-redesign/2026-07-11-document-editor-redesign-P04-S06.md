---
tags:
  - '#exec'
  - '#document-editor-redesign'
date: '2026-07-11'
modified: '2026-07-12'
step_id: 'S06'
related:
  - "[[2026-07-11-document-editor-redesign-plan]]"
---

# Add the formatting toolbar of kit IconButtons dispatching the insertion helper and enrolling Save plus the formatting verbs as shared action descriptors through the one keymap registry

## Scope

- `frontend/src/app/viewer/EditorToolbar.tsx`

## Description

- Add `EditorToolbar`: a `role="toolbar"` row of kit IconButtons (Lucide glyphs) for
  bold, italic, code, heading, bulleted/numbered list, quote, link, and link-to-
  document, each dispatching the pure `applyMarkdownFormat` command.
- Make the toolbar one roving FocusZone tab stop (horizontal, wrapping) via the shared
  `useFocusZone` — no hand-rolled roving loop.
- Keep focus in the textarea on mouse-down so the wrapped selection survives the click.
- Render-test command dispatch, the single-tab-stop invariant, and the disabled state.

## Outcome

Delivered. The body has real authoring affordances composed entirely from kit atoms.
Tests and the full lint gate pass.

## Notes

Formatting is a TOOLBAR-ONLY command surface with no keyboard accelerators. Save stays
the one editor keymap-registry binding (Mod+S). The plan/ADR's original "enroll the
formatting verbs in the registry" wording was reconciled to this: selection-applying
commands need the focused textarea a global thunk cannot reach, and the obvious chords
(Mod+K, Mod+B) collide with existing Class-A globals — so no formatting chords exist.
This resolves the code review's CRITICAL finding (an early draft's Mod+K accelerator
swallowed the command palette). Guarded by `MarkdownDocView.render.test.tsx`.
