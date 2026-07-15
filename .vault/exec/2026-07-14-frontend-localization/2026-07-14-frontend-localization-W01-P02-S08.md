---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
step_id: 'S08'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Add the global language setting and semantic display metadata while preserving the schema-owned settings contract

## Scope

- `engine/crates/vaultspec-session/src/settings_schema.rs`
- `engine/crates/vaultspec-session/src/lib.rs`
- `engine/crates/vaultspec-api/src/routes/session.rs`
- `engine/tests/tests/conformance.rs`

## Description

- Replace resolved English settings metadata with bounded semantic display identities.
- Add the global-only Language enum with System and English values.
- Preserve existing keys, defaults, scopes, controls, ordering, validation, and storage behavior.
- Validate semantic groups, field identities, enum coverage, uniqueness, and length bounds.
- Serve the semantic schema through the existing settings route.
- Prove the real route and write validation through engine conformance tests.

## Outcome

The engine remains the sole settings schema and persistence authority while serving no
resolved interface copy. Language is declared after the existing appearance settings,
defaults to System, accepts only `system` or shipped English, and cannot be scoped.

## Notes

Independent Sol review found one low semantic-ID grammar mismatch, which was fixed with
segmented-ID and length-boundary coverage. Twenty-five focused session tests, the real
route conformance test, Rust formatting, workspace Clippy, frontend integration, and diff
checks passed. No resolved label, description, group wording, placeholder, raw exception,
or development metadata is present in the served schema.
