---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S06'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Mount localization before the application boundary without changing theme or data-provider authority

## Scope

- `frontend/src/main.tsx`

## Description

- Bind the production document language before theme initialization and React mounting.
- Dispose only the document-language subscription during hot replacement.
- Mount the localization provider outside the application error boundary.
- Preserve the existing error, query, router, policy, theme, and diagnostic ownership.

## Outcome

The production root now applies the initialized locale to the document before visible
React output and makes the same runtime available to every application fallback and
route. Existing provider order and development-only controls remain unchanged.

## Notes

Targeted Prettier, ESLint, and TypeScript checks passed. The full frontend lint gate
also passed, including formatting, TypeScript, token drift, and component-name checks.
No user-facing copy, raw message key, diagnostic value, or runtime logging was added.
