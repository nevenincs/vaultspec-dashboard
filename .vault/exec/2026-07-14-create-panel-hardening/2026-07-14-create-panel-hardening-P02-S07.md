---
tags:
  - '#exec'
  - '#create-panel-hardening'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S07'
related:
  - "[[2026-07-14-create-panel-hardening-plan]]"
---

# Raise the chip-remove and back affordances to the touch floor, mark stems select-text, put a polite live region on the coverage card, and move information-bearing small captions off ink-faint

## Scope

- `frontend/src/app/left/CreateDocDialog.tsx`

## Description

- Raise the chip-remove and back affordances to the touch floor on coarse pointers (2.75rem min) with an always->=24px hit area (WCAG 2.5.8); chips grow with them.
- Mark the coverage stems, chip stems, and the selected-feature pill `select-text` (touch-selectability D2).
- Put a polite live region on the coverage card so the async Checking-to-rows (or degraded) swap is announced.
- Move information-bearing small captions off ink-faint to ink-muted (stems, "Not yet", the four state lines, the type-row reason/purpose hints); the decorative eyebrow stays for the app-wide S13 ruling pass.

## Outcome

Closes the panel's share of touch-target-subminimum (both audits), data-not-select-text (LOW), coverage-arrival-silent (MEDIUM), and the panel-local half of ink-faint-small-text-contrast. Render suite green.

## Notes

None.
