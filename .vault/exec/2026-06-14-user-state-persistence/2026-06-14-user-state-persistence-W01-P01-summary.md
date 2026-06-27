---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---

# `user-state-persistence` `W01.P01` summary

Wave `W01` summary (Phases `W01.P01` scaffold + store and `W01.P02` domain + tests; Steps
S01-S08). Delivered the co-resident orchestration crate `vaultspec-session`: a best-effort
durable user-state SQLite store and the session + settings domain over it.

- Created: `engine/crates/vaultspec-session/Cargo.toml`, `src/store.rs`, `src/schema.rs`,
  `src/session.rs`, `src/settings.rs`, `src/lib.rs`, `tests/store_test.rs`.
- Modified: `engine/Cargo.toml` (workspace dependency registration).

## Description

The crate owns a dedicated `user-state.sqlite3` in the gitignored `.vault/data/engine-data/`
zone (separate from the re-derivable `engine.sqlite3`), reusing the `engine-store`
rusqlite/WAL machinery with a deliberately best-effort heal: any corrupt or unopenable file
is recreated empty, with no fail-loud schema-version branch and no back-up-aside, per the
prototype posture. The public `UserState` handle exposes active-scope, per-scope folder +
feature-tag context, recents (most-recent-first, deduped, bounded), and global + scoped
settings. The read-and-infer fence is documented at the crate root: it persists only its own
session/settings and never writes vault documents or mutates git.

Verification: 13 tests (roundtrip restore, corrupt-recreate without panic, recents ordering)
pass; `cargo fmt`/`clippy`/`build` green. Code review verdict PASS; two LOW findings
(atomic recents rewrite, workspace dependency style) were applied as a follow-up commit. The
inference crates were untouched.
