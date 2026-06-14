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

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace user-state-persistence with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S01 and 2026-06-14-user-state-persistence-plan placeholders are machine-filled by
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
     The add the new workspace crate manifest and ## Scope

- `engine/crates/vaultspec-session/Cargo.toml` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
