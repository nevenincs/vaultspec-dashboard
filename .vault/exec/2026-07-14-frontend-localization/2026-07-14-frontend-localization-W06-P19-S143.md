---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S143'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Exercise destructive confirmations and prove explicit consequence, destructive verb, and safe cancel wording

## Scope

- `frontend/e2e/localization-confirmations.spec.ts`
- `frontend/e2e/localizationHelpers.ts`
- `frontend/playwright.config.ts`

## Description

Added a Playwright spec against the live served application, driving the real
feature-archive confirmation and proving the dialog carries an explicit
consequence body, a specific destructive verb on the confirm control (never a
generic "OK"), and safe cancel wording — then CANCELS, so the live corpus is
never mutated. Content first landed at `500b45adb7`, which itself named a
pair-order shared-tree-state interference with `S144` as a hardening item.

**Hardening (`2890e92df6`).** Reconciliation confirmed the interference was real
and broader than just this pair (also hit `S140`/`S142` standalone). Fixed by:
switching the Features-fold click to `ensureExpanded` (checks the real
`aria-expanded` state before clicking, so a blind click can no longer collapse a
fold a prior spec already expanded); and `workers: 1`.

## Outcome

Destructive-confirmation wording is proven live, and the fold-toggle race that
made this spec order-dependent is closed.

## Notes

This record was authored during a fill pass reconciling the team lead's
verification request across two rounds — no code changes by me.

Independently reverified against the hardening commit: `git show 2890e92df6
--stat` confirms this file's `ensureExpanded` switch; live reran the nine-spec
combined set under `playwright.config.ts` THREE consecutive times,
uncontended — 18/18 every time (this spec's own test included).

**TICK REVERSED (2026-07-17), pending cold-state fix.** After ticking against
`2890e92df6`, a further uncommitted follow-up edit surfaced in the working tree
driving a second lever `2890e92df6` itself did not yet close (the rail's
Vault/Files mode toggle, not just its visibility, inside
`ensureBrowserVisible`). My own warmed reruns (state carried across my own
back-to-back invocations, never truly cold) could not surface this gap.
Reversed pending the finisher's punch-list commit, verified cold, per the team
lead's ruling. No code changes by me at any point.
