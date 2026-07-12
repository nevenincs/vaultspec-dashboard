---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S33'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# Give the set-plan-step-state operation an explicit check/uncheck inverse and retire its rollback-unavailable gate, with tests proving a rollback flips only the target step

## Scope

- `engine/crates/vaultspec-api/src/authoring/rollback.rs`

## Description

- Add `SetPlanStepState` to the invertible operation set in `transitions.rs` `create_rollback_eligibility`, retiring the W01.P01 rollback-unavailable gate for plan ticks (the shared eligibility fn also backs the served rollback-eligibility projection, so both now report plan ticks rollback-eligible).
- Add the `SetPlanStepState` inverse-building arm in `rollback.rs`: the inverse is the OPPOSITE `set-plan-step-state` (check↔uncheck) against the SAME plan node + canonical step id, materialized through the same `materialize_set_plan_step_state` capability with the same engine-side stale-base fence and core-authoritative post-verify — placed BEFORE the whole-document preimage-restore `_ =>` fallback so a plan tick never reaches it.
- Flip the W01.P01 regression guard in `transitions.rs` to lock the NEW invariant: a plan-tick source is rollback-eligible (fails loudly if a future edit drops it back out of the invertible set).
- Add generation tests in `rollback.rs`: a check source rolls back by an uncheck (never a `ReplaceBody` preimage restore), an uncheck source rolls back by a check, and a repeated request replays the same inverse.
- Add a real-core clobber-proof test in the `plan_tick` module: tick S01, tick S02, then apply the inverse of the S01 tick (uncheck S01) and assert S01 re-opens while the concurrent S02 tick SURVIVES.

## Outcome

- The clobber the retired gate guarded against is now structurally impossible: the plan-tick inverse is a state-flip that touches only the one step, never a whole-document preimage restore that would rewrite the entire plan body and revert every other step ticked since. This is proven two ways — the generation test asserts the produced inverse is `SetPlanStepState`/opposite-state and NOT `ReplaceBody`, and the real-core test applies that inverse operation and shows a sibling tick untouched.
- The inverse rides the canonical rollback lifecycle (a `kind=Rollback` `RollbackProposed` changeset carried through review + approval + the shared apply path), identical in shape and provenance to the rename/section inverses; the deterministic rollback id (hash of source + idempotency key) is the source linkage and the replay identity.
- Gate: fmt `--check` clean, clippy `--all-targets` exit 0, all 9 touched tests pass (1 transitions guard, 3 rollback generation, 5 real-core plan_tick), and the full rollback (17) and transitions (12) suites pass with no regression.

## Notes

- Module-size ratchet: the change pushed the grandfathered `rollback.rs` (+245) and `direct_write.rs` (+81) over their frozen baselines, which the gate forbids growing. Resolved by extracting a new un-grandfathered `rollback_inverses.rs` that owns the plan-step inverse builder, the deterministic rollback-id helpers, the preimage-availability check, and the rollback generation tests (reusing the `rollback::tests` harness, now `pub(crate)`); and by consolidating the three added real-core plan-tick tests into one comprehensive round-trip test in `direct_write.rs`. Final sizes: `rollback.rs` 1970 (<=1979), `direct_write.rs` 2794 (<=2804). No baseline was ratcheted upward.
- The plan-tick inverse is preimage-INDEPENDENT (it captures a fresh preimage that is never consumed, exactly as on the forward path), but the eligibility gate still requires the SOURCE preimage be present (it always is for a fresh changeset). Kept conservative/fail-closed rather than exempting plan ticks from the preimage check, because `generate_rollback` unconditionally unwraps the source preimage on the shared path; a compacted source preimage would make a plan tick rollback-unavailable, consistent with every other kind. Flagged for the reviewer as a deliberate conservatism, not an oversight.
- Shared-tree friction: `vault_rows.rs` (a foreign lane) churned between compiling and broken (`gen` reserved-keyword + a lifetime error) for several minutes, intermittently blocking the crate-wide compile/clippy/test gate. My changes (rollback.rs, transitions.rs, direct_write.rs) are unrelated; I verified them in the clean windows. All gate commands passed once vault_rows.rs settled.
