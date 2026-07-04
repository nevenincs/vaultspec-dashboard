---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# `agentic-spec-authoring-backend` `W03.P14` summary

- Created: `engine/crates/vaultspec-api/src/authoring/validation.rs`.
- Modified: `engine/crates/vaultspec-api/src/authoring/mod.rs`.
- Modified: `engine/crates/vaultspec-api/src/authoring/store/mod.rs`.
- Modified: `engine/crates/vaultspec-api/Cargo.toml`.
- Modified: `engine/Cargo.lock`.
- Modified: `.vault/plan/2026-06-30-agentic-spec-authoring-backend-plan.md`.
- Modified: `.vault/audit/2026-06-30-agentic-spec-authoring-backend-audit.md`.
- Created: W03.P14 step records S66 through S70.

## Description

W03.P14 implemented durable validation status material for the whole-document
authoring walking skeleton. Validation now computes deterministic material and
validation digests over proposal operation material, reviewed diff material,
preimage metadata, current target revisions, normalized chunk evidence, and
validation findings.

The phase records warning-only states separately from blocking failures. Missing
chunk evidence is warning-only for the Increment 1 whole-document skeleton, while
stale chunk evidence, changed base revisions, missing current observations,
material integrity failures, and malformed frontmatter are blocking. `valid` and
`valid_with_warnings` are approval-ready; `invalid` and `stale` are not.

Durable validation persistence was added as authoring store schema version 6 with
`authoring_validation_records`. Latest validation lookup uses a monotonic
sequence, not timestamps, so tied millisecond captures cannot surface an older
approval-ready record over a newer stale or invalid record.

Formal review found two high and two medium issues. All were fixed and confirmed
by follow-up review. One low residual remains: `serde_yaml` is a temporary
deprecated parser dependency used narrowly for frontmatter validation until the
later core conformance adapter owns authoritative metadata validation.

Verification:

- `cargo test -p vaultspec-api authoring::validation -- --nocapture` passed with 16 validation tests.
- `cargo test -p vaultspec-api authoring::store::tests -- --nocapture` passed with 9 store tests.
- `cargo test -p vaultspec-api authoring -- --nocapture` passed with 123 authoring tests.
- `cargo clippy -p vaultspec-api --all-targets -- -D warnings` passed.

The authoring-wide test run still prints existing temporary-workspace watcher and
core graph warnings after the test result; the selected tests passed. No
destructive git operation was used.
