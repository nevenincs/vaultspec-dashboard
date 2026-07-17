---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S116'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Implement the React localization provider over the initialized production runtime

## Scope

- `frontend/src/platform/localization/LocalizationProvider.tsx`

## Description

- Bind React to the synchronously initialized application localization runtime.
- Resolve unknown message descriptors through the safe resolver at render time.
- Subscribe descriptor consumers to language changes without enabling Suspense.

## Outcome

React surfaces can now share the production localization runtime through a provider
that accepts only children. The localized-message hook remains reactive while keeping
translation keys, malformed descriptors, and missing resources behind the established
safe fallback boundary.

## Notes

The full frontend lint gate passed. A temporary real render test passed with the
project's DOM environment and was removed because the durable runtime suite belongs to
the later test step. Review follow-up stabilized the hook's namespace and option inputs
so unrelated renders do not recreate its subscription configuration. No scaffolds
remain.
