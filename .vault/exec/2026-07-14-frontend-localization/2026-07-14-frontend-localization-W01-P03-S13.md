---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-17'
body_hash: 'sha256:2e8c761bf5992d5aaea6398566c305fc731510ed35b9435870e5e3d430f66338'
step_id: 'S13'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Validate the complete required key set across every shipped locale

## Scope

- `frontend/src/localization/catalogKeys.test.ts`

## Description

- Validate shipped locale and namespace aggregates against explicit expected contracts.
- Verify exact parity between required keys, discovered leaves, and production key types.
- Compare the initialized source bundles with the exported production resources.

## Outcome

The catalog contract now fails when a shipped locale adds, removes, or misspells a leaf,
exposes an empty message, or diverges from the declared locales and namespaces. The test
exercises production catalogs and a fresh production runtime.

## Notes

Targeted formatting, lint, type checking, and real-runtime tests pass.
