---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S48'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Add resolver tests for duplicate stems, renames, provisional creates, missing documents, ref scopes, and bounded listings

## Scope

- `engine/crates/vaultspec-api/src/authoring/documents.rs`

## Description

- Add real temp-vault tests for existing document resolution, duplicate stems, missing documents, provisional creates, rename targets, and materialized results.
- Add a real git ref test proving ref snapshots read committed bytes instead of dirty worktree bytes.
- Add bounded listing tests for cursor continuity and hard-cap truncation.
- Add regression coverage for invalid proposed stems, invalid exact paths, identity lookup past the listing cap, and duplicate stems past the listing cap.

## Outcome

- Resolver coverage now exercises worktree files, committed git refs, and large real document sets without mocks, stubs, skips, or monkeypatches.
- The focused resolver suite passes with 13 tests.

## Notes

- Focused verification: `cargo test -p vaultspec-api authoring::documents -- --nocapture`.
