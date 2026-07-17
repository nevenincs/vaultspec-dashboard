---
tags:
  - '#exec'
  - '#create-panel-hardening'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S05'
related:
  - "[[2026-07-14-create-panel-hardening-plan]]"
---

# Make ineligible type rows aria-disabled and roving-included with their served reason associated via aria-describedby, add Home and End, and follow focus when reconcile moves the selection

## Scope

- `frontend/src/app/left/CreateDocDialog.tsx`

## Description

- Switch ineligible type rows from hard `disabled` to `aria-disabled`: focusable and roving-included, activation a no-op; the served reason (plain-language mapped) is programmatically associated via `aria-describedby`.
- Widen arrow roving to ALL rows (focus visits ineligible rows, selection only lands on eligible - the APG radio-with-disabled pattern); add Home/End with the same preventDefault + stopPropagation as the arrows.
- Follow focus when the async eligibility reconcile moves the selection while the radiogroup owns focus, so the roving tab stop and DOM focus never diverge.

## Outcome

Closes disabled-type-reason-unreachable (HIGH), home-end-missing-in-radiogroup (MEDIUM), and reconcile-moves-tabstop-not-focus (MEDIUM). The render test asserting the old hard-disabled contract was updated honestly to the aria-disabled one (focusable, described, activation no-op).

## Notes

None.
