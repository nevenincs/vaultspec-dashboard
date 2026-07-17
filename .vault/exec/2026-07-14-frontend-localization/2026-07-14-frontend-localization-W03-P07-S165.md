---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S165'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize rail-section and row-menu disclosure accessibility copy

## Scope

- `frontend/src/app/chrome/RailSection.tsx`
- `frontend/src/app/chrome/RowMenuDisclosure.tsx`

## Description

- `RailSection.tsx` was already a pure prop-driven primitive (`title` is
  caller-supplied) with no owned strings.
- `RowMenuDisclosure.tsx` was not: it carried a raw English default parameter
  `label = "Row actions"`, invisible to the scanner (default-parameter initializer, not
  a JSX literal).
- The coding lane (opus-l10n) made `label` a required prop rather than adding a new
  catalog key, since every one of the component's call sites (across
  `IslandLayer.tsx`, `CodeTree.tsx`, `TreeBrowser.tsx` ×3, `WorktreePicker.tsx`,
  `StatusTab.tsx` ×2, `DockWorkspace.tsx`, `MarkdownDocView.tsx`) already resolves a
  localized row-action label before passing it in.
- Independently confirmed via `git diff` and `npx tsc --noEmit` (clean across all ten
  call sites in the tree).

## Outcome

Both shared primitives carry no unlocalized copy; `RowMenuDisclosure`'s accessible
name can no longer silently fall back to raw English, enforced by the type system.

## Notes

Same scanner-blind defect class as `W03.P07.S162` (raw English default-parameter
initializer). Fixed by opus-l10n, independently reverified — not a fresh
implementation on my part.
