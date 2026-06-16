---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S19'
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
     The S19 and 2026-06-16-review-rail-viewers-plan placeholders are machine-filled by
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
     The Add a custom remark plugin rewriting double-bracket stem and stem-pipe-label wiki-link syntax into in-app link nodes resolving to doc:stem and emitting the navigation intent and ## Scope

- `frontend/src/app/viewer/remarkWikiLink.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add a custom remark plugin rewriting double-bracket stem and stem-pipe-label wiki-link syntax into in-app link nodes resolving to doc:stem and emitting the navigation intent

## Scope

- `frontend/src/app/viewer/remarkWikiLink.ts`

## Description

- Add a custom remark plugin rewriting `[[stem]]` and `[[stem|label]]` double-bracket forms into link nodes carrying a `vaultspec:doc:<stem>` sentinel URL, splicing text + link nodes in place and skipping links already inside an anchor.
- Add `wikiLinkNodeId` recovering the `doc:<stem>` id from the sentinel URL; the reader's anchor override intercepts the scheme and emits the same navigation intent the trees use.

## Outcome

In-body wiki-links become in-app navigation; the component test confirms a `[[stem|label]]` click resolves to `doc:<stem>` and opens the reader.

## Notes

None.
