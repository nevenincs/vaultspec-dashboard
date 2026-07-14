---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S117'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Implement safe production fallback that never exposes missing keys or diagnostic values

## Scope

- `frontend/src/platform/localization/fallback.ts`

## Description

- Add a React-free and store-free message resolver over the minimal i18next translation
  surface.
- Require catalog existence and validate translated output before returning it.
- Isolate interpolation data from i18next control options and prohibit call-site default
  values.
- Resolve the dedicated localized recovery message before using its direct source-catalog
  leaf as the terminal fallback.

## Outcome

Unknown or malformed descriptors, missing resources, translator exceptions, blank or
object results, key echoes, and unresolved interpolation now converge on safe catalog
copy. The resolver never logs rejected data or returns diagnostic state, message keys,
tokens, exceptions, or blank recovery text.

## Notes

Targeted Prettier, ESLint, and the full TypeScript project check passed. The mandatory
frontend lint recipe reached unrelated Prettier failures in four concurrent RAG panel
files after its ESLint, pixel, and module-size checks passed; those files were preserved.
The focused safety review found no critical or high issues.
