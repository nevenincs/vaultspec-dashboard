---
tags:
  - '#exec'
  - '#feature-group-authoring'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S10'
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
     The S10 and 2026-07-14-feature-group-authoring-plan placeholders are machine-filled by
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
     The Rebuild the dialog as the two-stage feature-group panel mirroring the approved frames: coverage rows, eligible-types-only choice with disabled-with-reason rows, editable link chips, honest same-day-duplicate refusal surfacing and ## Scope

- `frontend/src/app/left/CreateDocDialog.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Rebuild the dialog as the two-stage feature-group panel mirroring the approved frames: coverage rows, eligible-types-only choice with disabled-with-reason rows, editable link chips, honest same-day-duplicate refusal surfacing

## Scope

- `frontend/src/app/left/CreateDocDialog.tsx`

## Description

- Rebuild the flat New-document modal as the two-stage feature-group panel mirroring the approved Figma frames, keeping the shared `Dialog` primitive and the corpus-fed `AutocompleteCombobox` unchanged.
- Author stage 1 (Add to a feature): the feature combobox over the live corpus vocabulary plus an In-this-feature coverage card that reads served coverage through `useFeatureCoverageView` and renders one row per served pipeline type (glyph, plain-language label, newest stem, and a right status of Present / Not yet / a soft-accent Next step tag), with honest new-feature, loading, and degraded states.
- Author stage 2 (Add a document): a Document type radiogroup rendered ONLY from `deriveOfferedCreateDocTypes` (exec never offered), with each row carrying a plain-language label and a hint that maps the served note token to a reason for an ineligible (disabled-but-perceivable) type; a title input; and the editable pre-filled cross-links as removable chips.
- Wire the store recipe: reconcile the selected type against served eligibility when coverage changes, seed the related pre-fill on a type/feature change only (ref-gated so a bare coverage refresh never clobbers a user edit), gate Create on `isCreateDocTypeEligible`, and add roving arrow-key selection across the eligible type radios in-component.
- Surface the create receipt honestly: a `created` result opens the tab and resets; a refusal renders the served reason verbatim so core's same-day-duplicate message shows through.
- Rewrite the render tests to the staged panel over the real store and the live engine: stage flow, coverage rows from served data, exec absent, ineligible-type disabled-with-reason and unselectable, editable chips, and the feature-prefill entry.

## Outcome

- The panel renders the feature-group flow end to end against the approved design and drives the existing ledgered create mutation with the threaded `related` param; eligibility and link targets are read from served coverage and never client-recomputed.
- Eleven render tests pass (seven structural over the seeded no-scope client, four over the live engine over the fixture vault). `npx tsc --noEmit`, eslint, prettier, and the px scan are all clean on the touched files.

## Notes

- The same-day-duplicate refusal is surfaced by showing the served refusal reason verbatim rather than a bespoke rebuilt message: the create mutation folds a predicted path collision into a plain refusal carrying no structural kind, so the served text is the only honest signal and a reason-substring match is the very thing the codebase forbids.
- The stage-1 coverage card is a read-only view, so it honestly shows the full served pipeline including the step-record row; the creation affordances in stage 2 come only from the offered-types derivation, which excludes it.
- The doc-type glyph reuses the existing `DocTypeMark` from the scene mark plane (the same component the vault tree leads its rows with), bridged as a numeric icon size like the tree's own usage.

## Revision (post-review)

- Reviewer found one HIGH: the type radiogroup's arrow-key handler called `preventDefault()` but not `stopPropagation()`. Bare arrow keys are GLOBAL keybindings (feature/neighbor navigation) fired by the one dispatcher's `window` keydown listener; because the radios are buttons the dispatcher's text-entry gate does not suppress them and the `Dialog` traps only Tab, so roving between type radios ALSO mutated the graph selection.
- Fix: the radiogroup key handler now `stopPropagation()`s the consumed Arrow{Up,Down,Left,Right} keys (React synthetic stopPropagation invokes the native stopPropagation, so the event stops at the React root container and never reaches the `window` dispatcher), satisfying the actions-keymap-palette composite law; the in-code comment was corrected to state this.
- Added two regression tests: (1) arrow roving moves the type selection while a `window` keydown spy — the dispatcher's real entry point — is never called, with a control that the same key on the title input DOES reach the window listener (so the assertion is not tautological); (2) the coverage card renders distinct honest loading / degraded / new-feature states, driving the exported card with views built by the real `deriveFeatureCoverageView` reducer (degraded never shows the empty-pipeline note).
- Re-verified: 15 render tests pass; `npx tsc --noEmit`, eslint, and prettier clean on the touched files.
