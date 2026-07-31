---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
body_hash: 'sha256:cff969f02eedbbe3d2d8dc5493d55463c93fc71ddf61b4474399257150975b09'
step_id: 'S195'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Migrate comment-thread and reader-comment tests through production catalogs

## Scope

- `frontend/src/app/viewer/ReaderComments.render.test.tsx`
- `frontend/src/app/viewer/readerComments.test.ts`

## Description

- Confirmed neither test file mocks or stubs the localization runtime.
- Ran both test files live against the production engine and catalogs; all cases pass.

## Outcome

The comment-thread and reader-comment tests exercise production locale resources end
to end.

## Notes

Reconciliation pass (bookkeeping only, no code changes). This record retroactively
documents and ticks the plan step; verification was a live focused-test run, not a
fresh implementation.
