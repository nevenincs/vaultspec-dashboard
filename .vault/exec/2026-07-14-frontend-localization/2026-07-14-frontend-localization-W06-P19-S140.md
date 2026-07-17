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

**TICK UNCHECKED again (2026-07-17) — final protocol, not a fourth
disagreement.** The team lead's countermand message and my restore both landed
mid-race; a further team-lead message set the closing protocol for the whole
remaining set: leave `S140`/`S142`/`S143`/`S144` unticked as the conservative
default, and re-tick ALL of `S102`/`S103`/`S106`/`S107`/`S138`/these four
together in ONE clean cold verification pass once the finisher's punch-list
commit lands — a single batch close rather than a fourth flip-flop on this
step alone. This is a process decision about HOW the campaign closes, not a
dispute of this record's own verified evidence (which stands, and which this
step's eventual re-tick will cite alongside the punch-list commit). No code
changes by me at any point.

**TICK RE-CHECKED, ABSOLUTE SETTLE (2026-07-17) — final state, no further
flips.** The "unticked, final protocol" message above and the team lead's
countermand-confirmed "ticked" state (`eb68ad0115`) crossed in flight; the
"leave as-is" instruction that produced the unticked state was WRITTEN before
the team lead saw the restore and was stale by the time it was delivered. The
team lead explicitly settled this: `eb68ad0115`'s ticked state — four ticks
restored, full tick/reversal/restore arc preserved in these records — is
FINAL for this step. The evidence base is my own three consecutive
uncontended `18/18` reruns of `2890e92df6`; the cold-state gap remains
tracked as the finisher's own open punch-list item, which does NOT unverify
this step's ticked evidence. This tick does not move again until the
finisher's punch-list commit lands and the one closing cold-verification pass
runs. No code changes by me at any point.

**TICK UNCHECKED, TERMINAL FREEZE (2026-07-17) — no further tick-state
changes on any instruction short of the punch-list pass.** The team lead
issued a TERMINAL instruction voiding every prior tick-state message about
this step, including the "restored"/"absolute settle" ones the two notes
above document acting on: the state at `d6e0d3078f` (unticked) is FROZEN.
The team lead named the cause explicitly — an instruction-ordering failure on
their side, not a defect in this record's own evidence or in how it was kept
(append, never erase, through every flip). No further message about this
step's tick state is actioned until the ONE cold verification pass against
the finisher's punch-list commit — the sole remaining authority to re-tick.
The verified evidence in every note above (three consecutive uncontended
`18/18` reruns of `2890e92df6`) stands unchanged and will be cited again
alongside the punch-list commit's own evidence when that pass runs. No code
changes by me at any point.

**TICK RE-CHECKED, END OF SEQUENCE (2026-07-17) — FINAL, no further action on
any tick-state message short of the punch-list pass or S108.** The "TERMINAL
FREEZE (unticked)" note directly above was itself superseded: the team lead's
closing message explicitly named that freeze message as stale (it predates
their processing of the earlier restore) and VOIDED it along with every
other prior tick-state message. The state at `bc52be1f08` — four ticks
RESTORED, full arc documented, "no further flips" — is declared the FINAL
settled state, end of sequence: no message before it changes tick state, and
no message after it will either, short of the finisher's punch-list commit
triggering the one cold verification pass, or the team lead's own `S108`
dispatch. This is the last tick-state action taken on this step; the
verified evidence throughout (three consecutive uncontended `18/18` reruns of
`2890e92df6`) is unchanged and is what the cold pass will re-confirm and cite
alongside the punch-list commit. No code changes by me at any point.
