---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S243'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Production-fence the crash injector from user-facing builds

## Scope

- `frontend/src/platform/errors/CrashInjector.tsx`

## Description

- Verified the file no longer exists: it and its dedicated test file were deleted
  outright (74 + 88 lines removed, no replacement) in bulk commit `3562d0262a`
  ("localize frontend and split oversized modules").
- Grepped the full frontend source tree for any residual `CrashInjector` reference or
  import; found none.

## Outcome

The crash injector is fully removed from the shipped frontend rather than merely
fenced, which satisfies the step's requirement (no user-facing build can ever render or
trigger it) more strongly than a conditional fence would.

## Notes

Reconciliation pass (bookkeeping only, no code changes). This record retroactively
documents and ticks the plan step; verification was a source-tree grep confirming
complete removal with no dangling references, not a fresh implementation.
