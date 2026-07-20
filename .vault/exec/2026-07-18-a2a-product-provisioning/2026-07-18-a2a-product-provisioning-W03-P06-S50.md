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

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace a2a-product-provisioning with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S50 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Validate migration ranges and invoke only the staged A2A desktop migration entrypoint after complete quiescence and ## Scope

- `engine/crates/vaultspec-product/src/migration.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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

The `Quiescence::asserted_after_stop` constructor carries an `allow(dead_code)` with reason — it is the sealed witness the S52 transaction will consume, landed ahead of its consumer per the crate's existing convention. Windows tree-kill is the direct child only (a migration is a single process); if a future capsule migration spawns descendants on Windows, the W03.P07 updater's job-object spawn is the tree authority — flagged for review. The bounded runner drains-then-caps so the output-cap proof is deterministic across pipe-buffer sizes (an earlier retain-only reader passed on Windows but would have deadlocked into a timeout on Linux — fixed).
