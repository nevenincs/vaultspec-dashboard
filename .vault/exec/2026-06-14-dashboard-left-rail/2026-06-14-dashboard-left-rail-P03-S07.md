---
tags:
  - '#exec'
  - '#dashboard-left-rail'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S07'
related:
  - "[[2026-06-14-dashboard-left-rail-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-left-rail with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S07 and 2026-06-14-dashboard-left-rail-plan placeholders are machine-filled by
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
     The Add an in-rail filter scoped to the active browser mode that narrows the already-fetched listing client-side and ## Scope

- `frontend/src/app/left/` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add an in-rail filter scoped to the active browser mode that narrows the already-fetched listing client-side

## Scope

- `frontend/src/app/left/`

## Description

- Add `RailFilter`: an inline filter input scoped to the active mode, writing to the browser-mode store's `filter`.
- Narrow client-side: code mode threads `filter` into `CodeTree`'s `filter` prop; vault mode threads it into `VaultBrowser`'s new `filter` prop via `filterVaultEntries` (stem / path / feature-tag).

## Outcome

An in-rail filter scoped to the active mode narrows the already-fetched listing client-side; committed.

## Notes

`filterVaultEntries` is a pure, unit-tested narrowing over the entries the `/vault-tree` query already returned.
