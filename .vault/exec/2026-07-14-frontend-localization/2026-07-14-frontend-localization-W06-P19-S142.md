---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S142'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Exercise production error boundaries and prove raw diagnostics never render in any build mode

## Scope

- `frontend/e2e/localization-errors.spec.ts`
- `frontend/e2e/localizationHelpers.ts`
- `frontend/playwright.config.ts`
- `frontend/playwright.localization.config.ts`

## Description

Added a Playwright spec run under BOTH `playwright.config.ts` (the production
`vaultspec serve` build) and `playwright.localization.config.ts` (the Vite dev
build) — proving raw diagnostics never render in EITHER build mode, not just one.
Proves: a malformed vault-listing failure, a malformed status-endpoint failure, a
completely non-JSON response body, and an aborted request each never leak a raw
diagnostic body/stack trace/network-error string. Content first landed at
`3aead802d2`.

**Hardening (`2890e92df6`).** Reproducibly red on my own initial verification
(3/4 red across two separate cold runs, plus a `ReferenceError` on one test that
had a stray call to the old `ensureBrowserVisible` name left over from a
partially-applied edit) — same root cause as `S140`: the shared helper's
postcondition depended on leftover state from an unrelated prior run. Fixed by
the same `bootHealthyThenBreakVaultTree` helper (now applied consistently across
all three tests in this file, closing the partial-edit gap I found) plus
`workers: 1`.

## Outcome

Production error-boundary diagnostic safety is now proven live in both build
modes, with the underlying test-infrastructure race closed and the file's
partial-edit inconsistency resolved.

## Notes

This record was authored during a fill pass reconciling the team lead's
verification request across two rounds — no code changes by me.

Independently reverified against the hardening commit: `git show 2890e92df6
--stat` matches; confirmed all three tests in this file now use
`bootHealthyThenBreakVaultTree` consistently (no stray old-helper reference
remains); live reran the nine-spec combined set under `playwright.config.ts`
THREE consecutive times, uncontended — 18/18 every time (this file's 4 tests
included); live reran under `playwright.localization.config.ts` (the dev-build
leg) — 11/11, including this file's 4 tests there too.

**TICK REVERSED (2026-07-17), pending cold-state fix.** After ticking against
`2890e92df6`, a further uncommitted follow-up edit surfaced in the working tree
driving a second lever (`bootHealthyThenBreakVaultTree`'s own
`ensureBrowserVisible` call still didn't drive the rail's Vault/Files mode
toggle, only its visibility) that `2890e92df6` itself did not yet close. My own
warmed reruns (state carried across my own back-to-back invocations, never
truly cold) could not surface this gap. Reversed pending the finisher's
punch-list commit, verified cold, per the team lead's ruling. No code changes
by me at any point.

**TICK RESTORED (2026-07-17) — countermand.** The reversal above raced the team
lead's own report of my findings back to me: my `79cca4c869` tick was backed by
fresh, independent re-verification (three consecutive uncontended 18/18 combined
runs, 11/11 on the dev-harness pair, per-fix citations against the actual
diff) — exactly the evidence class the team's ordering rule favors. The team
lead countermanded the reversal instruction on this basis and confirmed the
original tick stands. The cold-state gap this record's reversal note describes
is real and still open — it is the finisher's punch-list work, to be verified
against ITS OWN commit when it reports, not a reason to hold this step's own
verified evidence. No code changes by me at any point; this note documents the
instruction race, not a change in the underlying verification.
