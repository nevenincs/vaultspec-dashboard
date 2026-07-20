---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-20'
step_id: 'S42'
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
     The S42 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Prove dedicated A2A lease-repository migration, reopen, expiry, idempotent settlement, and restart reconciliation without depending on authoring-session schemas and ## Scope

- `engine/crates/vaultspec-api/src/a2a_run_leases.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Prove dedicated A2A lease-repository migration, reopen, expiry, idempotent settlement, and restart reconciliation without depending on authoring-session schemas

## Scope

- `engine/crates/vaultspec-api/src/a2a_run_leases.rs`

## Description

- Confirm the dedicated A2A lease repository proves migration, reopen, reserve/commit/resolve, idempotent settlement, and lease-id mismatch in one standalone test that opens its own SQLite file with no authoring-session schema dependency.
- Confirm expiry revocation and the pre-sweep resolution refusal are proven by their own tests, and restart durability by the terminal-settlement reopen and reserved-revoke-on-restart tests.

## Outcome

S42's acceptance is satisfied by the committed dedicated-repository test suite: `migrate_reopen_reserve_commit_resolve_and_settle` covers schema migration, fresh-handle reopen durability, reserve inertness until commit, authoritative binding, idempotent terminal settlement (Settled then AlreadyTerminal), and lease-id mismatch; `expiry_revokes_an_unsettled_lease` and `a_token_past_expiry_does_not_resolve_even_before_the_sweep` cover expiry; the terminal-settlement suite's `a_settled_terminal_is_durable_across_a_repo_reopen` and `reserved_leases_revoke_on_restart_while_committed_leases_survive` cover restart reconciliation. All open a standalone `LeaseRepo`, never an authoring-session store. Verified green earlier this session (a2a_run_leases 5/5 + settlement suite).

## Notes

No new test was required — the acceptance was fully met by the committed inline suite, so this step closes on verification rather than added code. A full-crate re-run at close time was blocked by an unrelated live `vaultspec-product` `generation`/`locking` module-split refactor; the S42 tests themselves were confirmed passing before that churn began.
