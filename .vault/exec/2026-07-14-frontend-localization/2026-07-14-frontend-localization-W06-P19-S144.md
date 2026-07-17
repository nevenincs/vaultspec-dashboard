---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S144'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Exercise menus, commands, and shortcuts and prove shared action wording and canonical verbs

## Scope

- `frontend/e2e/localization-actions.spec.ts`
- `frontend/e2e/localizationHelpers.ts`
- `frontend/playwright.config.ts`

## Description

Added a Playwright spec against the live served application proving: the command
palette lists Title Case commands with no internal ids; and a document context
menu renders shared canonical verbs (Open in editor / Show on canvas / Reveal /
Copy) with zero internal-id leakage. Content first landed at `500b45adb7`, which
named a pair-order shared-tree-state interference with `S143` as a hardening
item.

**Hardening (`2890e92df6`).** My own reconciliation found this test flaking
roughly 50% standalone across three runs — the context-menu test switched to
`ensureExpanded` (real `aria-expanded` check before clicking a fold, so a prior
spec's already-expanded fold is never blindly re-collapsed); a
`scrollIntoViewIfNeeded()` before each row's right-click, since a probe row
outside the viewport could not receive the click; the row-menu wait timeout
raised from 1.5s to 3s to tolerate fold-expand virtualization settling; and an
explicit `waitFor({ state: "hidden" })` after each `Escape` so the NEXT probe
iteration's right-click never races a still-closing menu from the PREVIOUS
iteration. Plus `workers: 1`.

## Outcome

Menu/command/shortcut wording is proven live, and the menu-close race that made
the multi-row probe loop flaky is closed.

## Notes

This record was authored during a fill pass reconciling the team lead's
verification request across two rounds — no code changes by me.

Independently reverified against the hardening commit: `git show 2890e92df6
--stat` confirms this file's fold/scroll/menu-close changes; live reran the
nine-spec combined set under `playwright.config.ts` THREE consecutive times,
uncontended — 18/18 every time (this file's own 2 tests included, with the
previously-flaky context-menu test green in all three).

**TICK REVERSED (2026-07-17), pending cold-state fix.** After ticking against
`2890e92df6`, a further uncommitted follow-up edit surfaced in the working tree
driving a second lever `2890e92df6` itself did not yet close (the rail's
Vault/Files mode toggle, not just its visibility, inside
`ensureBrowserVisible`). My own warmed reruns (state carried across my own
back-to-back invocations, never truly cold) could not surface this gap.
Reversed pending the finisher's punch-list commit, verified cold, per the team
lead's ruling. No code changes by me at any point.

**TICK RESTORED (2026-07-17) — countermand.** The reversal above raced the team
lead's own report of my findings back to me: my `79cca4c869` tick was backed by
fresh, independent re-verification (three consecutive uncontended 18/18 combined
runs, the fold/scroll/menu-close fixes cited against the actual diff) — exactly
the evidence class the team's ordering rule favors. The team lead countermanded
the reversal instruction on this basis and confirmed the original tick stands.
The cold-state gap this record's reversal note describes is real and still
open — it is the finisher's punch-list work, to be verified against ITS OWN
commit when it reports, not a reason to hold this step's own verified evidence.
No code changes by me at any point; this note documents the instruction race,
not a change in the underlying verification.
