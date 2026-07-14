---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S30'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize operation command labels

## Scope

- `frontend/src/stores/view/commandProviders/opsCommandProvider.ts`
- `frontend/src/stores/view/commandProviders/opsCommandProvider.test.ts`

## Description

- Transport canonical whitelist label descriptors directly into palette commands.
- Remove the legacy presentation wrapper and internal `ops:` prefix.
- Preserve command IDs, families, gates, ordering, confirmations, and dispatch routes.

## Outcome

Operation commands now use clear workspace and search language without exposing ops, core, RAG, vault, server, watcher, or reindex terminology.

## Verification

- `just dev lint frontend`
- Five focused Vitest files, 35 tests
- Independent Sol review approved with no findings

## Notes

This step landed atomically with S127. Together they removed seven obsolete localization exemptions and reduced the scanner from 1,422 to 1,415 findings.
