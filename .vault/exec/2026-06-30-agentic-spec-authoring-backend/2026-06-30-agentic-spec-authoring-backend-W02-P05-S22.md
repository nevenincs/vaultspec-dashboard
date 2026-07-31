---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-01'
modified: '2026-07-01'
body_hash: 'sha256:e2e503d2aaff3da26f7dfb5f073b7d95b16fe77195d5efbd550ca960131beb94'
step_id: 'S22'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Implement authoring store connection management, migration runner, schema metadata, and fail-loud version checks

## Scope

- `engine/crates/vaultspec-api/src/authoring/store/`

## Description

- Add the private `authoring::store` module and direct `rusqlite` dependency for
  the API crate.
- Resolve the authoring database path to a dedicated product-state location at
  `.vault/data/authoring-state/authoring-state.sqlite3`.
- Configure SQLite connections with the existing project WAL, busy-timeout,
  synchronous, and foreign-key pragmas.
- Implement a migration runner backed by `PRAGMA user_version`,
  `authoring_schema_migrations`, and singleton `authoring_store_metadata`.
- Fail loud on future schema versions, missing metadata, wrong store kind,
  mismatched schema version, unknown migration rows, tampered migration names,
  duplicate migration rows, and corrupt database headers.
- Avoid any `open_or_heal` path for authoring product data.

## Outcome

The authoring backend now has a scoped durable store binding with migration and
schema metadata checks, but no domain repositories or product-state tables
beyond the bootstrap metadata.

## Notes

The initial implementation incorrectly used the engine cache directory. That was
fixed before phase closure and covered by the path test.
