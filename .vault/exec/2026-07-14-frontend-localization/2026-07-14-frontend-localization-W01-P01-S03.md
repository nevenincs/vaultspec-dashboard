---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S03'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Define bounded typed message keys, values, descriptors, and confirmation descriptors

## Scope

- `frontend/src/platform/localization/message.ts`

## Description

- Derive namespace-qualified message-key types and a runtime allowlist from the English
  resource aggregate.
- Bound interpolation value names, value counts, string lengths, and finite numeric
  values without altering accepted user data.
- Normalize immutable message and confirmation descriptors through strict own-field
  validation.
- Restrict complete confirmations to explicit labels and the catalog-owned safe cancel
  action.

## Outcome

The frontend now has a React-free and store-free message contract for non-rendering
presentation seams. Unknown catalog keys, inherited or extra fields, accessors,
malformed value names, oversized data, non-finite numbers, arrays, objects, and
incomplete or ambiguous confirmations are rejected without manufacturing fallback
copy.

## Notes

The full frontend lint recipe reached an unrelated existing ESLint configuration error
in `CreateDocDialog.tsx`. Targeted Prettier and ESLint checks, the full TypeScript
project check, and an isolated TypeScript 6 strict compile of the new contract passed.
The full formatting check also reported only that unrelated file.

Review remediation constrains confirmation primary actions at both compile time and
runtime to the catalog's semantic `destructiveActions` category. The allowlist is
generated from the typed source catalog rather than inferred from English copy, and
destructive labels retain bounded named values for object-specific messages.
