---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S162'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize shared loading, empty, degraded, and status primitives

## Scope

- `frontend/src/app/kit/Skeleton.tsx`
- `frontend/src/app/kit/Spinner.tsx`
- `frontend/src/app/kit/StateBlock.tsx`

## Description

- `Skeleton.tsx` and `StateBlock.tsx` were already pure prop-driven primitives with no
  owned strings (label/title/message are caller-supplied).
- `Spinner.tsx` was not: it carried a raw English default parameter
  `label = "Loading"` that the localization scanner cannot see (it inspects JSX
  literals, not default-parameter initializers) and would have rendered whenever a
  caller omitted the prop.
- The coding lane (opus-l10n) made `label` a required prop (removing the default)
  rather than adding a new catalog key, on the grounds that every live caller
  (`Transcript.tsx`, `CanvasStateOverlay.tsx` ×2) already supplies a localized label —
  turning a latent scanner-blind default into a compile-time-enforced contract is
  stronger than a catalog fallback that could itself go stale.
- Independently confirmed via `git diff` and `npx tsc --noEmit` (clean — proving every
  caller in the tree does pass `label`).

## Outcome

All three shared state primitives carry no unlocalized copy; `Spinner.tsx`'s
accessible label can no longer silently fall back to raw English at any call site,
enforced by the type system rather than a runtime default.

## Notes

FINDING: this is a scanner-blind defect class (raw English in a JSX default-parameter
initializer, not a literal) that the original scan-localization tooling does not catch.
Worth flagging in the closing audit as a tooling gap; the design choice here (required
prop over new catalog key) is a stronger, TypeScript-enforced fix. Fixed by opus-l10n,
independently reverified in this reconciliation pass — not a fresh implementation on my
part.
