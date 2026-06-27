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
