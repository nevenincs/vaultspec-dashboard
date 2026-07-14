---
tags:
  - '#exec'
  - '#feature-group-authoring'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S12'
related:
  - "[[2026-07-14-feature-group-authoring-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace feature-group-authoring with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S12 and 2026-07-14-feature-group-authoring-plan placeholders are machine-filled by
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
     The Relabel the new-document descriptors feature-first once on the descriptor plane, ids unchanged, so menu, palette, and keymap legend agree and ## Scope

- `frontend/src/stores/view/graphCommands.ts and descriptor sites` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Relabel the new-document descriptors feature-first once on the descriptor plane, ids unchanged, so menu, palette, and keymap legend agree

## Scope

- `frontend/src/stores/view/graphCommands.ts and descriptor sites`

## Description

- Relabel the one shared new-document action descriptor feature-first on the descriptor plane: the single label constant in `leftRailKeybindings.ts` changes from the document-first wording to `Add to a Feature…`, Title Case per the label-casing convention, ellipsis preserved to match every sibling descriptor.
- Confirm the change is authored ONCE: the constant feeds both the keybinding definition (the `?` legend) and the `newDocumentAction` builder that every context menu (feature, category, section, doc) and the command palette compose, so menu, palette, and keymap legend all read the new label with no per-surface edit.
- Relabel the feature-scoped affordance that already interpolates its own tooltip (the Features-section header create control in `TreeBrowser.tsx`) to the feature-first `Add a document to <section>` form.
- Relabel the two generic hand-typed create affordances that carry their own labels (the vault-mode create control in `BrowserRegion.tsx` and the empty-state button in `WorkspaceGhost.tsx`) to `Add to a feature`, Sentence case matching their sibling tooltip/button copy.
- Leave every action id, keymap chord, and provider enrollment untouched (label-only change); update the descriptor JSDoc header to name the new verb.

## Outcome

The new-document verb reads feature-first everywhere it surfaces. The generic entry is `Add to a Feature…` (menu rows, command palette, and the derived keymap legend, all from the one constant); the feature-scoped Features Plus reads `Add a document to features`; the two generic buttons read `Add to a feature`. No descriptor id, chord, or enrollment changed, so the keymap/palette/menu plane did not churn. The only remaining occurrences of the old wording are a historical code comment describing the pre-rebuild modal and synthetic keybinding fixtures in a palette test whose asserted value is the derived accelerator, not the label.

## Notes

The label lives in exactly one constant; the context menus that pre-fill a feature (feature and category rows) do not interpolate a label and therefore inherit the generic entry text, which is the intended behaviour per the ADR D6 relabel-once mandate.
