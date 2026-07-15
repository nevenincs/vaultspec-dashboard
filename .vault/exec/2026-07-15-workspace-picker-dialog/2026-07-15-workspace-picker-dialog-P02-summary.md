---
tags:
  - '#exec'
  - '#workspace-picker-dialog'
date: '2026-07-15'
modified: '2026-07-15'
related:
  - "[[2026-07-15-workspace-picker-dialog-plan]]"
---




# `workspace-picker-dialog` `P02` summary

Phase complete: 4/4 Steps (S02-S05), executed by a delegated engine executor.
- Modified: `engine/crates/vaultspec-api/src/routes/fs_browse.rs`
- Modified: `engine/crates/vaultspec-api/src/routes/registry.rs`

## Description

`GET /fs/list` now serves the ADR D4 display truth: per-entry `is_hidden`
(dotname or Windows hidden attribute; drive roots always served unhidden) and
`is_registered` (normalized cross-reference against the engine's own workspace
registry), a response-level `is_registered` for the browsed directory itself, a
roots-level `places` block (home directory), and `hidden`/`q` request params
applied BEFORE the row cap so a truncated level stays filterable (filtering
law). `add_workspace` refusals carry the typed `error_kind`
(`not_a_directory`, `not_a_git_workspace`, `unreadable`) through the shared
envelope helper (ADR D6) — corrected mid-flight from an initially-invented
`reason` field onto the existing convention. `already_registered` is declared
and serialization-tested but unreachable: the frozen registry contract makes
re-registration an idempotent upsert (conformance-tested), and the picker's
`is_registered` marker prevents the attempt.

Verification: vaultspec-api tests green (821 at phase close), conformance suite
3/3, `cargo fmt --check` and workspace clippy `-D warnings` exit 0.
