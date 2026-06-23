---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-23'
modified: '2026-06-23'
step_id: 'S19'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---




# Define the document/code viewer focus model (scrollable region focusable, internal controls in order)

## Scope

- `frontend/src/app/viewer/CodeViewer.tsx`

## Description

- Fixed a real WCAG 2.1.1 gap in the read-only viewers: the CodeViewer scroller (`role="region"`) and the MarkdownReader body scroll div had NO tab stop and hold no focusable content, so a keyboard user could not focus or scroll them. Added `tabIndex={0}` (and `role="region"` + `aria-label="document"` on the markdown body) so both are keyboard-focusable and scrollable by arrows / PageUp-Down / Home-End.
- The markdown EDITOR (`MarkdownDocView`) already exposes a focusable textarea ("document body editor"); no change needed there.

## Outcome

- Both read-only viewers are now keyboard-scrollable; tsc/eslint/prettier clean; CodeViewer + MarkdownReader tests (13) green.

## Notes

- Live re-confirmation (open a doc, focus the body, PageDown scrolls) deferred — browser MCPs locked this turn. The change is a static a11y attribute, low-risk.
