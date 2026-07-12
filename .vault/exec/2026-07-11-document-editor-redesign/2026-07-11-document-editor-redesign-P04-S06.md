---
tags:
  - '#exec'
  - '#document-editor-redesign'
date: '2026-07-11'
modified: '2026-07-11'
step_id: 'S06'
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
     The S06 and 2026-07-11-document-editor-redesign-plan placeholders are machine-filled by
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
     The Add the formatting toolbar of kit IconButtons dispatching the insertion helper and enrolling Save plus the formatting verbs as shared action descriptors through the one keymap registry and ## Scope

- `frontend/src/app/viewer/EditorToolbar.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
