---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S03'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace user-state-persistence with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S03 and 2026-06-14-user-state-persistence-plan placeholders are machine-filled by
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
     The implement the best-effort user-state SQLite store with open-or-heal recreate-on-corrupt and ## Scope

- `engine/crates/vaultspec-session/src/store.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
