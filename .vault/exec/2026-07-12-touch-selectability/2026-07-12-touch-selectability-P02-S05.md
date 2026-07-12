---
tags:
  - '#exec'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S05'
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
     The S05 and 2026-07-12-touch-selectability-plan placeholders are machine-filled by
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
     The Render wiki-links and Related-footer stems as selectable anchor-shaped elements with unchanged activation so prose ranges stay contiguous and ## Scope

- `frontend/src/app/viewer/MarkdownReader.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Render wiki-links and Related-footer stems as selectable anchor-shaped elements with unchanged activation so prose ranges stay contiguous

## Scope

- `frontend/src/app/viewer/MarkdownReader.tsx`

## Description

<!-- Succinct line-by-line list of steps executed. Use imperative language, mirroring git commit summary lines. -->

- Replace the wiki-link `<button>` override in the markdown `a()` component and the
  Related-footer stem `<button>` with `<a href="#">` elements, calling
  `event.preventDefault()` in `onClick` before the same in-app preview navigation.
- Keep keyboard reachability and click activation unchanged; a native anchor is
  focusable and Enter-activated without any suppressed selection, so a sentence
  containing a link now selects as one contiguous range.
- Update the reader's existing tests that asserted a `button` role for these two
  controls to assert a `link` role instead.

## Outcome

Both in-body wiki-links and the Related-footer stems render as anchors; the existing
`MarkdownReader.test.tsx` suite (8 tests) was updated for the role change and passes.

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
