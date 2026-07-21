---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-20'
step_id: 'S50'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Validate migration ranges and invoke only the staged A2A desktop migration entrypoint after complete quiescence

## Scope

- `engine/crates/vaultspec-product/src/migration.rs`

## Description

- Add the `migration` module: deterministic migration-range validation plus a quiescence-gated, bounded staged-migration invocation.
- Validate revision identifiers against the capsule migration grammar (`Revision`): non-empty, bounded, alphanumeric plus `._-`, alphanumeric first byte, never a floating alembic selector; wrap a candidate base/head pair as `MigrationRangeSpec`.
- Decide a `MigrationPlan` from the installed head against the candidate range: already-current when the installed head equals the candidate head, a forward step when it equals the candidate base or the install is fresh, and a fail-closed `IncompatibleRange` otherwise — the product never orders opaque revisions, since only the capsule owns the migration graph.
- Gate invocation on a typed `Quiescence` witness the S52 transaction constructs only after draining and stopping the owned runtime, so a migration can never run against a live database.
- Resolve the staged migration program capsule-relative through the shared `ResolvedProgram` authority; invoke it bounded by an output byte cap AND a wall-clock timeout, draining stdout so the child never blocks and killing the process group on either breach (unix `killpg`; windows direct child) — a non-zero exit is a typed failure carrying bounded output; an already-current plan spawns nothing.
- Register `pub mod migration` and add unit tests: revision/range grammar, all four plan outcomes, already-current-runs-no-process, and four bounded-runner proofs (captured output/success, wall-clock timeout, output-cap breach, non-zero exit) driven against a REAL re-invoked child process, no mocks.

## Outcome

Delivered `src/migration.rs` (+ `migration/tests.rs`), 13 tests. Full product gate green: build, `cargo test -p vaultspec-product` (117 lib + all integration), `clippy --all-targets -D warnings`, `fmt --check` all exit 0.

## Notes

The `Quiescence::asserted_after_stop` constructor carries an `allow(dead_code)` with reason — it is the sealed witness the S52 transaction will consume, landed ahead of its consumer per the crate's existing convention. The bounded runner drains-then-caps so the output-cap proof is deterministic across pipe-buffer sizes (an earlier retain-only reader passed on Windows but would have deadlocked into a timeout on Linux — fixed).

Review revision (P06 review MEDIUM): replaced the Windows direct-child-only kill with a real process-tree kill. The runner now spawns through a `MigrationChild` wrapper that, on Windows, contains the child in a `command_group` job object (the same tree-kill contract `process::GatewayProcess` uses) — so a timeout or output-cap breach reaps every alembic/python descendant instead of leaking them. Unix keeps its process-group `killpg`.
