---
tags:
  - '#exec'
  - '#agent-wire-gaps'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S48'
related:
  - "[[2026-07-17-agent-wire-gaps-plan]]"
---

# Route Phase P05 to the team reviewer for verification against the frontend cutover acceptance criteria

## Scope

- `engine/crates/vaultspec-api/src/authoring/http/handlers1.rs`
- `engine/crates/vaultspec-api/src/authoring/http/tests/group2.rs`
- `engine/crates/vaultspec-api/src/authoring/http/tests/group3.rs`
- `engine/crates/vaultspec-api/src/authoring/session/mod.rs`
- `frontend/src/app/agent/Composer.render.test.tsx`
- `frontend/src/app/agent/ProposalCard.live.test.tsx`

## Description

Two-round review.

**Round 1 (initial PASS with one HIGH).** `resume_interrupt` had no authorization
floor: any standing registered actor could resolve ANY run's pending interrupt —
approving a stranger's pending tool-permission grant, or injecting a steering
prompt into a run they did not own and had no delegation relationship to. The
route's write-side counterpart, `complete_run`, already enforced a run-owner-or-
delegator floor; `resume_interrupt` acted on the same run-scoped authority
(granting permission, steering an agent mid-run) without the matching check. The
review also caught a TEST-INTEGRITY defect the bug had hidden behind: the original
`Composer.render.test.tsx` steer test's own header comment asserted "resume is a
capability-by-id, not owner-fenced" as a documented DESIGN choice — the test had
normalized the exact gap the review found, rather than catching it, because the
test never modeled two DIFFERENT principals where one lacked ownership.

**Fix (`ff3863dbec`).** Added `super::super::session::authorize_run_owner(&run,
&actor)?` inside the SAME unit-of-work as the interrupt resolve in
`resume_interrupt` — the run-owner-or-delegator floor, matching `complete_run`'s
existing pattern, atomic with the resolve (no TOCTOU window). Added a new engine
test, `interrupt_resume_refuses_a_standing_stranger`, proving the stranger fence
two ways: the resume route returns 403 naming "owner" in the refusal, AND the
interrupt stays `"pending"` on the served list afterward (the fence is not merely
an error code — nothing was silently mutated). Re-seeded two pre-existing tests
(`interrupt_resume_route_resolves_by_id_and_replays` in `group2.rs`,
`run_interrupt_listing_recovers_pending_and_serves_typed_decisions` in
`group3.rs`) with REAL owned runs instead of bare literal run ids, so they now
exercise the owner-authorized path honestly rather than accidentally bypassing the
new floor via an unowned/nonexistent run id. Rewrote `Composer.render.test.tsx`'s
steer test (S41) to model PRODUCT ownership correctly: the AMBIENT human opens the
session and owns the run; a separate AGENT principal parks the interrupt by
executing a mutating tool without a grant; the SAME ambient human — the run's
owner — steers, which the fixed route now correctly authorizes. Fixed a stale LOW
in `ProposalCard.live.test.tsx`'s header comment, which still described the
pre-`S42` actor-identity correlation heuristic; updated it to describe the actual
exact-`run_id`-bind scenario the test proves (a direct-route proposal, which by
design carries no run provenance, correctly leaves the transcript's turn slot
empty rather than falling back to a heuristic).

**Round 2 (PASS-FINAL).** The reviewer re-verified the fix and re-ran the gate.

## Outcome

**Verdict: PASS-FINAL.** The authorization floor is closed at the same unit-of-
work boundary as the write it protects, proven by a positive owner-path test and a
negative stranger-fence test at both the engine route level and the served-list
level, plus a frontend test that now models real product ownership instead of a
tautological same-principal shortcut. The test-integrity lesson (a test can bake
in and normalize the very bug a review later catches) is recorded here for the
closing audit.

## Notes

Fix landed at `ff3863dbec` ("resume_interrupt gains the run-owner-or-delegator
floor, P05 review HIGH — stranger fence tested engine+frontend, steer test models
product ownership"); an unrelated clippy cleanup (needless-borrow in the same test
file, from a different in-flight edit) landed moments later at `e37806b1f9`. Plan
tick at `044382d7d3`. This record was authored during a fill pass at the team
lead's request, citing the two-round review verdict and the fix commits — no code
changes by me.

Independently reverified against HEAD, not the report alone: live rerun of
`authoring::http::tests::group2::interrupt_resume_route_resolves_by_id_and_replays`,
`authoring::http::tests::group3::interrupt_resume_refuses_a_standing_stranger`, and
`authoring::http::tests::group3::run_interrupt_listing_recovers_pending_and_serves_typed_decisions`
— 3/3 passed; full lib suite `cargo test -p vaultspec-api --lib` — 831/831 passed;
`cargo fmt --check` — clean; `cargo clippy --all-targets` — zero warnings (the 3
warnings flagged in an earlier fill pass are gone, confirming `e37806b1f9`'s
cleanup landed clean). Frontend: `Composer.render.test.tsx` — 9/9 passed
(including the rewritten S41 steer test and, incidentally, the previously-flagged
unrelated pre-existing red slash-command test — now also green, fixed elsewhere);
`ProposalCard.live.test.tsx` — 1/1 passed.
