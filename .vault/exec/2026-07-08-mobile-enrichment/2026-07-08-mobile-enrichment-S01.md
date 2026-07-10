---
tags:
  - '#exec'
  - '#mobile-enrichment'
date: '2026-07-09'
modified: '2026-07-09'
step_id: 'S01'
related:
  - "[[2026-07-08-mobile-enrichment-plan]]"
---

# D2: surface document review metadata inline on compact (date + plain-language ADR acceptance / plan progress) as a second meta line

## Scope

- `desktop one-value+tooltip untouched`
- `frontend/src/app/left/TreeBrowser.tsx`

## Description

- Add `docCompactSubMeta` deriving the authored date + plain-language status word (ADR acceptance / plan done-of-total) from served fields only.
- Add a `subMeta` slot to the shared `VaultTreeRow`; when present, render the title over an inline meta line and suppress the desktop trailing signal/meta so a row never carries both.
- Branch `DocumentRow` on `useViewportClass()`: compact passes `subMeta`; desktop keeps its one-value + shape-mark + hover tooltip unchanged.

## Outcome

Compact document leaves surface the date + status word inline; the desktop density law is untouched. Verified live @390px (123 inline ADR-status words, 94 plan-progress values, 224 dates).

## Notes
