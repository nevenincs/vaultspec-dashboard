---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:ad9ea7a9de14aac27fe7ea45f723434d16ad2b033453e7ceea7303a2bedf8d02'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# `approval-shape-reconciliation` `W01.P01` summary

Deleted the dead review-authority branch (D2): `authorize_command`'s fourth guard delegated to `policy::reviewer_eligibility` only when a caller supplied `origin_author`, and all three production call sites always passed `None`. Removed the branch, its supporting field, function, and wrapper, and the trailing `None` argument at every call site, end to end across the engine crate.

- Modified: `engine/crates/vaultspec-api/src/authoring/security.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/policy.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/http/handlers1.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/http/handlers3.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/http/mod.rs`

## Description

- `security.rs`: removed `CommandAuthorization::origin_author`, the review-authority clause in `authorize_command`, `is_review_authority_command`, the now-unused `reviewer_eligibility` import, and the test exercising the deleted clause; corrected the module and struct docs.
- `policy.rs`: removed the orphaned `reviewer_eligibility` wrapper, its unit test, and the now-unused `automated_self_approval_blocker` import.
- `http/handlers1.rs`, `http/handlers3.rs`, `http/mod.rs`: dropped the `origin_author` parameter from `run_authorization` and removed the trailing `None` argument from all three production call sites.

The self-approval ban was NOT weakened: it remains fully enforced at its two real seams, `authoring::approvals::review_decision_eligibility` and the apply preflight, neither of which this Phase touched. Wave `W01.P02` (not yet executed) adds the destructive-floor enforcement at those seams.

## Verification

- `cargo check -p vaultspec-api --all-targets`: clean, zero errors, zero warnings.
- `cargo fmt -p vaultspec-api -- --check`: clean.
- `cargo clippy -p vaultspec-api --all-targets`: zero warnings in `vaultspec-api` (one pre-existing warning surfaced from the unrelated `ingest-struct` dependency, outside this Phase's scope and outside this crate).
- `cargo test -p vaultspec-api`: 918 passed, 1 failed, 0 ignored (919 total). The one failure, `authoring::documents::tests::missing_documents_fail_loudly`, is in a file this Phase does not touch (`authoring/documents.rs`) and was under active concurrent modification by another session in the shared tree at execution time; confirmed unrelated by scoped runs of the touched modules: `authoring::security::tests` 5/5 passing, `authoring::policy::tests` 9/9 passing (each exactly one fewer than before, matching the deleted tests).
