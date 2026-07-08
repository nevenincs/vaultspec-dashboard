---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S50'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Verify document references remain stable across rename and provisional-create scenarios

## Scope

- `engine/crates/vaultspec-api/src/authoring/documents.rs`

## Description

- Verify rename refs preserve the reviewed source ref and derive the proposed `doc:<stem>` identity.
- Verify materialized result refs capture result path, result node id, and real result revision.
- Verify provisional create refs report conflicting, available, and unknown collision states without creating files.
- Verify duplicate and over-cap stem cases do not silently resolve to unstable identities.

## Outcome

- Document references remain stable across rename and provisional-create scenarios.
- All final Rust verification commands passed for `vaultspec-api`.

## Notes

- Final verification: `cargo test -p vaultspec-api authoring::documents -- --nocapture`, `cargo test -p vaultspec-api authoring -- --nocapture`, `cargo test -p vaultspec-api`, and `cargo clippy -p vaultspec-api --all-targets -- -D warnings`.
