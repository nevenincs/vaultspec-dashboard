---
tags:
  - '#exec'
  - '#feature-group-authoring'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S13'
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
     The S13 and 2026-07-14-feature-group-authoring-plan placeholders are machine-filled by
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
     The Update the affordance, palette, action-coverage guard tests and the dialog render tests to the staged panel and ## Scope

- `frontend/src/app/newDocumentAffordances.guard.test.tsx and sibling guards` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Update the affordance, palette, action-coverage guard tests and the dialog render tests to the staged panel

## Scope

- `frontend/src/app/newDocumentAffordances.guard.test.tsx and sibling guards`

## Description

- Update the new-document affordances guard so each button assertion matches the relabeled copy: the empty-state button and the vault-mode create control are now found by the accessible name `Add to a feature`. The Features-section Plus is located by its data attribute, not by name, so it needs no change.
- Update the `BrowserRegion` render test to assert the vault-mode create control by `Add to a feature` in both the shown-in-vault-mode and hidden-in-code-mode cases.
- Update the `WorkspaceGhost` render test to assert the recovery button by `Add to a feature`.
- Audit the remaining guard suites named in the worklist: the command-palette guard asserts ids, families, and derived accelerators (never the label text), and the action-coverage guard asserts cross-plane enrollment by id, so both pass unchanged; the default-keybinding-conflicts guard passes unchanged. The dialog render suite locks the staged panel and references no descriptor label, so it is untouched.
- Confirm no production or asserted occurrence of the old label remains: the only survivors are a historical code comment and synthetic keybinding fixtures whose asserted output is the accelerator.

## Outcome

The touched suites and the full feature sweep pass online against the live engine over the fixture vault: 12 test files, 135 tests, exit 0 (the harness emits a benign socket-hang-up during teardown, not a failure). The suites exercised: the affordances guard, the `BrowserRegion` and `WorkspaceGhost` render tests, the dialog render lock, the create-doc chrome store, the command-palette and action-coverage guards, the new-document identity test, the left menus test, the default-keybinding-conflicts guard, and the feature-coverage stores queries. Descriptor ids are unchanged and the palette/coverage guards passed without edits, confirming the relabel did not disturb cross-plane enrollment.

## Notes

The command-palette guard's `label: "New document"` entries are inputs to accelerator-derivation assertions, not label assertions, so they are correctly left as-is rather than churned to the new copy.
