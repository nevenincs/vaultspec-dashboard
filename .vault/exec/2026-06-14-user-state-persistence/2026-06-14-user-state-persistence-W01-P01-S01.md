---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S01'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---




# add the new workspace crate manifest

## Scope

- `engine/crates/vaultspec-session/Cargo.toml`

## Description

- Author the `vaultspec-session` crate manifest, inheriting `version`, `edition`, `license`, `repository`, and `rust-version` from `workspace.package` and the workspace `[lints]`.
- Depend on `rusqlite` at the exact `engine-store` version and `bundled` feature, plus `serde`, `serde_json`, and `thiserror` matching the workspace conventions.
- Depend on `engine-store` by path to reuse `engine_data_dir` and the open-or-heal pattern, and add `tempfile` as a dev-dependency for the store tests.
- Add a minimal placeholder `src/lib.rs` so the crate is buildable; the public handle and fence docs land in S07.

## Outcome

The new crate manifest exists with no torch or rag dependency, mirroring the `engine-store` rusqlite and serde versions exactly so the workspace resolves a single rusqlite. The `members = ["crates/*"]` glob already discovers the crate; the explicit `workspace.dependencies` entry that lets `vaultspec-api` consume it lands in S02.

## Notes

The placeholder `src/lib.rs` is intentional scaffolding; it is replaced with the documented public handle and read-and-infer fence prose in S07.
