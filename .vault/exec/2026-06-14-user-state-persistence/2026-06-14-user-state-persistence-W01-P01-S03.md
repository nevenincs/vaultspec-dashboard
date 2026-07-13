---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S03'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---

# implement the best-effort user-state SQLite store with open-or-heal recreate-on-corrupt

## Scope

- `engine/crates/vaultspec-session/src/store.rs`

## Description

- Implement the best-effort user-state `Store` in `store.rs`, opening a dedicated `user-state.sqlite3` resolved through `engine_store::engine_data_dir` so it sits beside `service.json` and `engine.sqlite3` as a SEPARATE file.
- Mirror the `engine-store` opener: WAL journaling, `NORMAL` synchronous, foreign keys on, and a ten-second busy-timeout for resident-versus-one-shot contention.
- Implement `open_or_heal` with best-effort discipline: ANY open or schema-init failure removes the file plus its WAL/SHM siblings once and recreates empty, with NO fail-loud schema-version branch, since nothing here is precious.
- Add a `StoreError` enum over rusqlite, io, and serde, and wire `store` and `schema` modules into `lib.rs`.

## Outcome

The store opens a fresh database from nothing, heals a garbage file by recreating it empty, and resolves its path to `.vault/data/engine-data/user-state.sqlite3`. The deliberate divergence from `engine-store` is the dropped fail-loud branch: a shape or version mismatch is recreated rather than reported, per the prototype best-effort posture. The inference crates are untouched; this crate only reuses `engine-store`'s `engine_data_dir` helper.

## Notes

The `schema::ensure_schema` call this store invokes is authored in S04; the working tree builds with both present. The crate-internal `conn()` accessor is unused until the session and settings domains land in S05 and S06, so a transient dead-code warning exists mid-wave and clears once those modules consume it.
