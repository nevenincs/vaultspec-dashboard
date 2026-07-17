---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S88'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize Markdown document presentation while preserving titles, paths, headings, and user-authored content as data

## Scope

- `frontend/src/app/viewer/MarkdownDocView.tsx`

## Description

- Verified the component resolves its chrome copy through `useLocalizedMessage` over
  typed descriptors (18 call sites), while titles, paths, headings, and
  user-authored Markdown content are passed through as data, never translated or
  reformatted.
- Ran the bounded localization scanner against the file and confirmed zero exact
  findings.

## Outcome

The Markdown document view renders only localized, typed-descriptor chrome copy;
user-authored content remains untouched data.

## Notes

Reconciliation pass (bookkeeping only, no code changes). The work landed in bulk commit
`3562d0262a` ("localize frontend and split oversized modules"), later rebuilt atop the
unified diff renderer in `b15c6dc51e`, remaining fully typed throughout. This record
retroactively documents and ticks the plan step; verification was file inspection plus
a scoped scanner run, not a fresh implementation. Note: the file's own render-test
suite (`MarkdownDocView.render.test.tsx`) surfaced a stale-assertion defect (casing
mismatch on an accessible-name lookup), reported separately under `W05.P15.S89`; the
component under test is correct.
