---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
body_hash: 'sha256:4fb6b8776e3bcd5d9347ff6e9ee1181b9117032219a0a0dcac611ad37af69586'
step_id: 'S182'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Standardize and localize commit menu actions

## Scope

- Commit menu descriptors, history recovery, clipboard labels, catalogs, tests, and scanner allowlist.

## Description

- Replace historical navigation strings with typed timeline descriptors.
- Replace internal history-state descriptions with actionable recovery messages.
- Name full hash, short hash, and commit-message copy actions explicitly.
- Preserve navigation effects, time-travel behavior, and raw user-domain clipboard data.

## Outcome

Commit menus use clear project-history language without exposing corpus or scope terms.

## Notes

This step shipped atomically with S184. The combined affected suite passed 73 tests and
the complete frontend lint recipe. Independent review found no issues.
