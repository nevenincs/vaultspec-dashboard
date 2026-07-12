---
tags:
  - '#exec'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S06'
related:
  - "[[2026-07-12-touch-selectability-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace touch-selectability with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S06 and 2026-07-12-touch-selectability-plan placeholders are machine-filled by
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
     The Re-enable text selection on vault tree row data text and route the row menus through the selection guard and ## Scope

- `frontend/src/app/left/TreeBrowser.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Re-enable text selection on vault tree row data text and route the row menus through the selection guard

## Scope

- `frontend/src/app/left/TreeBrowser.tsx`

## Description

<!-- Succinct line-by-line list of steps executed. Use imperative language, mirroring git commit summary lines. -->

- Add `select-text` to the shared row shell class used by every tree level (feature
  folder, category folder, document leaf), re-enabling selection over titles, meta,
  and dates inside the roving-tabindex `<button>`.
- Wrap the row's `onContextMenu` (used by `vault-doc` / `vault-feature` /
  `vault-category` resolvers) and the section header's `onContextMenu` (`vault-section`)
  with `guardedContextMenu`.

## Outcome

Every level of the vault tree re-enables selection over its data text via
`user-select: text` on the shared row shell, and both context-menu entry points yield
to a live intersecting selection.

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
