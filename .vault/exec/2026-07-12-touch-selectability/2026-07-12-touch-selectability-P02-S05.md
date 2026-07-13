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




# Render wiki-links and Related-footer stems as selectable anchor-shaped elements with unchanged activation so prose ranges stay contiguous

## Scope

- `frontend/src/app/viewer/MarkdownReader.tsx`

## Description


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

