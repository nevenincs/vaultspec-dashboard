---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S18'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace review-rail-viewers with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S18 and 2026-06-16-review-rail-viewers-plan placeholders are machine-filled by
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
     The Render the leading YAML block through a dedicated FrontmatterHeader: tags as pills, date and modified as stamps, related as clickable wiki-links and ## Scope

- `frontend/src/app/viewer/FrontmatterHeader.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Render the leading YAML block through a dedicated FrontmatterHeader: tags as pills, date and modified as stamps, related as clickable wiki-links

## Scope

- `frontend/src/app/viewer/FrontmatterHeader.tsx`

## Description

- Add the FrontmatterHeader with a small total parser handling exactly the vault frontmatter shape (tags/related list sequences, date/modified scalars, inline lists), splitting the leading YAML block from the body and never throwing.
- Render tags as pills on the accent-subtle ground, dates as stamps in muted ink, and related entries as clickable wiki-links that open the target in the reader via the open-in-viewer intent.

## Outcome

Frontmatter renders as structured chrome; the component test confirms pills, date stamps, and clickable related links that fire the navigation intent.

## Notes

None.
