---
tags:
  - '#exec'
  - '#rag-job-dashboard'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S08'
related:
  - "[[2026-07-14-rag-job-dashboard-plan]]"
---

# Add the wide size variant to the one Dialog primitive with a render test

## Scope

- `frontend/src/app/chrome/Dialog.tsx`

## Description

## Outcome

## Notes

## Description

- Add the `size` prop to the one Dialog primitive: default 34rem, wide 52rem through a width map, shared compact max-width guard kept; two render tests.

## Outcome

Green. Executed by the named Opus coder rag-shell-coder; verified independently (53 tests across panels + Dialog).

## Notes

Pure width mapping; the primitive already carried the header/body/pinned-footer structure from a same-day sibling lane.
