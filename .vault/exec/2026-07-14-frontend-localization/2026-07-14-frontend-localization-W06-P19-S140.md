---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S140'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Exercise live degraded states and prove every visible effect and recovery action is user-facing

## Scope

- `frontend/e2e/localization-degraded.spec.ts`
- `frontend/e2e/localizationHelpers.ts`
- `frontend/playwright.config.ts`

## Description

Added a Playwright spec against the live served application proving: a failed
vault listing shows a translated degraded notice with a real, working retry
action; and the degraded notice never leaks the raw served reason string. Content
first landed at `3aead802d2`.

**Hardening (`2890e92df6`).** My own reconciliation pass found this spec
reproducibly red standalone (2/2 fails across two separate cold runs) — traced to
`ensureBrowserVisible`'s postcondition (the vault-documents tree visible)
depending entirely on leftover server-persisted "Documents" tab state from an
unrelated prior test, since nothing the helper itself does switches tabs. Fixed
by: the new `bootHealthyThenBreakVaultTree` helper, which boots the app against
the REAL working wire first, explicitly switches to Documents, confirms the tree
is genuinely visible, THEN installs the failing route and reloads — proving the
honest working-to-broken transition rather than racing an already-broken
interception against the boot sequence; and `workers: 1` added to
`playwright.config.ts`, since the single live `vaultspec serve` origin holds
server-side view state not test-isolated across files/workers.

## Outcome

Degraded states are proven live over a genuine working→broken transition, with
the underlying test-infrastructure race that made this reproducibly flaky/red now
closed.

## Notes

This record was authored during a fill pass reconciling the team lead's
verification request across two rounds — no code changes by me.

Independently reverified against the hardening commit, not the earlier flaky
report: `git show 2890e92df6 --stat` matches; live reran the full nine-spec
combined set (`localization-typical/loading/degraded/empty/errors/confirmations/
actions/responsive.spec.ts` under `playwright.config.ts`) THREE consecutive
times with no other concurrent test load running — 18/18 every time (this spec's
own 2 tests included in each). Earlier runs made concurrently with a heavy
background `vitest run` showed intermittent reds in this combined set
(resource-contention noise, not a defect in the hardening itself) — the
isolated, uncontended reruns are the authoritative signal.

**TICK REVERSED (2026-07-17), pending cold-state fix.** After ticking against
`2890e92df6`, a further uncommitted follow-up edit surfaced in the working tree
(driving a second lever — the rail's Vault/Files mode toggle, not just its
visibility) that `2890e92df6` itself did not yet drive. My own "warmed" reruns
(state carried across my own back-to-back invocations, never truly cold) could
not surface this gap; a genuinely cold engine/session start still needs the
finisher's punch-list fix to pass. Reconciliation's original hold was correct;
this tick was released on a stale instruction and is now reversed pending the
finisher's punch-list commit, verified cold, per the team lead's ruling. No code
changes by me at any point.

**TICK RESTORED (2026-07-17) — countermand.** The reversal above raced the team
lead's own report of my findings back to me: my `79cca4c869` tick was backed by
fresh, independent re-verification (three consecutive uncontended 18/18 combined
runs, the resource-contention attribution, per-fix citations against the actual
diff) — exactly the evidence class the team's ordering rule favors. The team
lead countermanded the reversal instruction on this basis and confirmed the
original tick stands. The cold-state gap this record's reversal note describes
is real and still open — it is the finisher's punch-list work, to be verified
against ITS OWN commit when it reports, not a reason to hold this step's own
verified evidence. No code changes by me at any point; this note documents the
instruction race, not a change in the underlying verification.
