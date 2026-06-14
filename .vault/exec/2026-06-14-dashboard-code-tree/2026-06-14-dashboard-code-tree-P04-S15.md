---
tags:
  - '#exec'
  - '#dashboard-code-tree'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S15'
related:
  - "[[2026-06-14-dashboard-code-tree-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-code-tree with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S15 and 2026-06-14-dashboard-code-tree-plan placeholders are machine-filled by
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
     The Test the code-mode selection join both directions and the four honest states and ## Scope

- `frontend/src/app/left/` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Test the code-mode selection join both directions and the four honest states

## Scope

- `frontend/src/app/left/`

## Description

- Test the code-mode selection join both directions: a file-row click selects the file's `code:` node (row → stage), and the active stage selection highlights its matching code row (stage → row), against the real stores client transport (mockEngine), no component-internal doubles.
- Test the four honest states: loading (a never-resolving transport), empty (a real corpus with an empty code tree), degraded (a structural-tier block via `setNoVault`), and error (a non-ok response with no tiers envelope).
- Test the lazy one-level-per-directory expansion, the quiet absent-interlink state vs the linked marker, and the in-rail client-side filter.

## Outcome

- COMMITTED (code-tree-exclusive new files): `frontend/src/app/left/CodeTree.render.test.tsx` (11 cases) and `frontend/src/app/left/codeSelection.test.ts` (the pure selection-join unit cases).
- Gate: the code-tree tests pass (15 cases across the two files); the full frontend suite is green (845 passed, 9 pre-existing skips not mine, 0 failed).

## Notes

- The degraded state is driven by a REAL `structural` tiers block the engine serves and read through the stores selector, proving the surface renders worktree-only degradation as a designed state — not a bare error, not a healthy-looking empty.
- No skips, no `it.skip`/`xit`, no tautological assertions: every state is exercised through the real client transport and asserts an observable DOM/store outcome.
