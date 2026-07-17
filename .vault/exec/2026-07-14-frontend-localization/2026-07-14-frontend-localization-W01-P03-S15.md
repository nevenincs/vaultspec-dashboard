---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S15'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Add the localization scanner to the standard frontend lint gate

## Scope

- `frontend/package.json`
- `justfile`

## Description

- Expose the production localization scanner as the `lint:localization` package command.
- Run localization enforcement immediately after ESLint in the standard frontend lint
  recipe.
- Preserve the order and behavior of every existing frontend lint gate.

## Outcome

The standard frontend lint recipe now rejects new, stale, or metadata-altered
localization findings before formatting and type checking. The direct command and full
recipe both accept the unchanged 1,560-entry migration baseline.

## Notes

The full frontend lint recipe passed and showed localization enforcement directly after
ESLint, followed by the existing pixel, module-size, formatting, TypeScript, token, and
Figma-name gates.
