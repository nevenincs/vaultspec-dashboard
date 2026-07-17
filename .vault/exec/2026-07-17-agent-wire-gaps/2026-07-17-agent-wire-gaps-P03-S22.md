---
tags:
  - '#exec'
  - '#agent-wire-gaps'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S22'
related:
  - "[[2026-07-17-agent-wire-gaps-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace agent-wire-gaps with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S22 and 2026-07-17-agent-wire-gaps-plan placeholders are machine-filled by
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
     The Add optional run_id/turn_id fields to the changeset revision input and ledger record, stamped at tool-executor dispatch where ExecuteToolCallRequest already carries run_id and the turn joins through the run record and ## Scope

- `engine/crates/vaultspec-api/src/authoring/executor.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add optional run_id/turn_id fields to the changeset revision input and ledger record, stamped at tool-executor dispatch where ExecuteToolCallRequest already carries run_id and the turn joins through the run record

## Scope

- `engine/crates/vaultspec-api/src/authoring/executor.rs`

## Description

- Add `run_id: Option<RunId>` and `turn_id: Option<String>` to `ChangesetAggregateRecord`, defaulted to `None` in the `new` constructor so every direct/human path starts unstamped.
- Add `with_run_provenance(run_id, turn_id)` as a builder applied AFTER `new` — deliberately outside `aggregate_digest` computation, so attaching provenance never perturbs `changeset_revision` identity (wire-contract stable-key rule).
- Extend the `append_revision` INSERT to the v21 `authoring_changeset_revisions.run_id`/`turn_id` columns (already migrated on this tree by the parallel P01 lane), binding the record's provenance fields.
- Add unit tests: provenance round-trips through `history()` and the raw SQL columns while `changeset_revision` stays byte-identical before/after `with_run_provenance`; a human/direct changeset persists with both columns `NULL`.

## Outcome

The ledger-record half of S22 is landed at commit `169ecd4aa0`: the schema fields, the digest-exclusion guarantee, and the persistence round-trip. `cargo test -p vaultspec-api ledger` — 22/22 passed, including `run_provenance_round_trips_and_preserves_revision_identity` and `a_human_changeset_carries_no_run_provenance`.

## Notes

The plan step's full scope also names the tool-executor dispatch site (`engine/crates/vaultspec-api/src/authoring/executor.rs`) stamping `with_run_provenance` from `ExecuteToolCallRequest`'s `run_id` and the joined turn. That call site is NOT yet wired — `with_run_provenance` is defined and unit-tested but not called anywhere outside its own tests (verified via `grep -rn with_run_provenance engine/crates/vaultspec-api/src/`). Do not tick `P03.S22` fully closed on the plan until the dispatch-site wiring lands; report this gap to the lead rather than mark it done.

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
