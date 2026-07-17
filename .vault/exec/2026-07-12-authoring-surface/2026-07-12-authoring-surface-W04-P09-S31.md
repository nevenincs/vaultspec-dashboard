---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-17'
step_id: 'S31'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# Scroll the reader to the target heading when a followed wiki-link carries a fragment, using the block-identity slugs already stamped on headings

## Scope

- `frontend/src/app/viewer/MarkdownDocView.tsx`

## Description

- Add a `wikiLinkFragment` resolver beside `wikiLinkNodeId` that extracts the `#slug` a section wiki-link carries (the block-identity slug the reader already stamps as each heading's id), returning null for a bare link or a non-wiki URL.
- Add a small view-local scroll-intent signal so a followed section link records a `(nodeId, slug)` the target reader consumes once rendered — the click originates in one reader while the scroll happens in the target's, which loads asynchronously.
- In the reader's wiki-link handler, record the scroll intent after the target tab opens when the link carries a fragment.
- In the reader, hold a ref to the scroll region and, when a scroll intent targets this document and the content is ready, scroll the heading whose stamped id equals the slug into view and move focus to it (made programmatically focusable) for keyboard/AT parity; consume the intent whether or not a heading matched, so a missing anchor is a plain open with no error.
- Tests: `wikiLinkFragment` extraction, a copy-to-follow round-trip through the plugin and resolvers, and reader render tests that a scroll intent scrolls and focuses the right heading and is inert for an unmatched fragment.

## Outcome

Following a `[[stem#slug]]` section link opens the document and scrolls the reader to the section, resolving the fragment through the SAME block-identity slug the plugin stamps (never a second slugger). An unmatched fragment opens the document plainly.

## Notes

The scroll effect lives in the reader (it owns the scroll region and the headings); the plan named the doc-view file, but the reader is the "reader plumbing as needed" the step allows. Heading lookup is scoped to the reader's own region ref so ids never collide across simultaneously-mounted readers.

Review polish (approved, two LOWs landed): the reader now clears a still-pending scroll intent on unmount (or when its document changes) before the intent is consumed, so a failed or aborted load can never leave a dormant intent that scroll-jumps a later unrelated reopen of the same document; and the async loading→ready path now has its own regression test (record the intent while loading, assert the scroll and focus fire when the state flips to ready) alongside a test that the dormant intent is cleared on unmount.

Two further review LOWs were accepted as-is and are recorded here as known ceilings: (1) the focus move imperatively sets `tabindex="-1"` on the target heading rather than threading a focusable-heading prop through the render — a small imperative touch judged simpler than restructuring the heading components; (2) the reader's fenced-code highlight can momentarily lag a theme/content swap (a pre-existing highlighter idiom unrelated to this step), left unchanged.
