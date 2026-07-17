---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S163'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize shared section, breadcrumb, property, and progress display labels

## Scope

- `frontend/src/app/kit/SectionLabel.tsx`
- `frontend/src/app/kit/Breadcrumb.tsx`
- `frontend/src/app/kit/PropertyRow.tsx`
- `frontend/src/app/kit/ProgressBar.tsx`

## Description

- Verified `Breadcrumb.tsx` resolves its separator/overflow copy through
  `useLocalizedMessage` over typed descriptors.
- Verified `SectionLabel.tsx` and `PropertyRow.tsx` are pure display-only, prop-driven
  primitives with no internally-owned strings; all rendered text is caller-supplied
  `children`/`label`/`value`, so localization is the caller's responsibility at the call
  site, consistent with the design-system centralization pattern.
- Verified `ProgressBar.tsx` replaced its literal `"/"` separator with the shared
  `DecorativeGlyph name="slash"` component (non-text, `aria-hidden`) so the numeric
  "value/max" readout carries no hardcoded punctuation string; the `label` prop
  (accessible name) is caller-supplied.
- Ran the bounded localization scanner against all four files and confirmed zero exact
  findings.

## Outcome

All four shared primitives are locale-agnostic: two resolve typed message descriptors
directly, two are pure prop-driven display components with no owned strings.

## Notes

Reconciliation pass (bookkeeping only, no code changes). This record retroactively
documents and ticks the plan step; verification was file inspection plus a scoped
scanner run, not a fresh implementation. A defect was found and reported separately: the
component-level test `frontend/src/app/kit/ProgressBar.render.test.tsx` (`renders the
optional tabular value readout`) still asserts a literal `"3/10"` text match, which now
fails because the `DecorativeGlyph` separator splits the readout across sibling DOM
nodes. That test is not in this step's scope (it belongs to `W03.P07.S45`'s render-test
glob) and is listed on the defect list, not fixed here.
