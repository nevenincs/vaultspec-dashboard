---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-20'
step_id: 'S52'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace a2a-product-provisioning with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S52 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Require the copied external updater to acquire the install lock drain and stop the owned runtime snapshot and verify state run staged migration verify the final-name unpublished generation atomically select it only by the separately durable active receipt relaunch and probe acceptance in that order and ## Scope

- `engine/crates/vaultspec-product/src/transaction.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Require the copied external updater to acquire the install lock drain and stop the owned runtime snapshot and verify state run staged migration verify the final-name unpublished generation atomically select it only by the separately durable active receipt relaunch and probe acceptance in that order

## Scope

- `engine/crates/vaultspec-product/src/transaction.rs`

## Description

- Add the `transaction` module: the ordered, durable, recoverable external-update transaction.
- Add a durable `UpdateDescriptor` persisted atomically under the transaction directory (temp + rename + directory fsync), carrying the phase (the existing `receipt::InterruptionMarker`), consistency generation, candidate/prior generation ids, channel, and target head; its presence and phase are the recovery authority and it carries no secret.
- Add a pure, total `plan_next(phase, StepResult)` phase planner: forward through the fixed order on success, `RollingBack` on any pre-commit failure, terminal once accepted or rolling back (a committed release cannot be rolled back by a later failure).
- Add the `UpdateTransaction` orchestrator that reproves the guard and persists the descriptor before each effect, running the ordered steps: begin (Staged) → drain-and-stop the owned runtime within a bounded graceful window (Draining, yielding proven `Quiescence`) → capture+verify the consistency snapshot (Snapshotted, S49) → run the staged migration under quiescence (Migrating, S50) → hand off a `ReadyToActivate` token at the activation boundary.
- Roll back from any pre-commit phase: record `RollingBack`, restore the consistency snapshot (retained, or reopened from the durable snapshot), and clear the descriptor — so a failed candidate leaves no split release set; a step failure auto-rolls-back while preserving the original error.
- Add `read_descriptor` for recovery (S53), guard-verified and byte-bounded no-follow.
- Register `pub mod transaction` and add tests over REAL components (no doubles): exhaustive pure-planner coverage, ordered per-phase marker persistence, snapshot rollback restoring the whole group + clearing the descriptor, a real migration-spawn-failure auto-rollback, a real live-child drain-and-stop, and descriptor round-trip + foreign-guard refusal.

## Outcome

Delivered `src/transaction.rs` (+ tests), 8 tests. Full product gate green: build, `cargo test -p vaultspec-product` (136 lib + all integration), `clippy --all-targets -D warnings`, `fmt --check` all exit 0.

## Notes

Per the confirmed typed-seam decision, materializing the verified candidate generation and the atomic receipt-selection commit (steps 6-7: Activated/Accepted) consume the sealed release authority and are performed downstream over the materializer/receipt boundary; this module owns the ordered state machine, the durable descriptor, and the REAL drain/stop, snapshot, migration, and rollback effects, handing off `ReadyToActivate`. Tests inject real failures (a non-existent migration program, a real live child to stop) rather than test doubles. The phase marker reuses `receipt::InterruptionMarker` — its order (Activated=files materialized, then Migrating, then receipt commit) matches this step's row, so no parallel enum was introduced. No scaffolds or skipped work.
