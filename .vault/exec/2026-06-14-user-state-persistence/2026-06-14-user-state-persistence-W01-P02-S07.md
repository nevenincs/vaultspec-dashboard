---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S07'
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
     The S07 and 2026-06-14-user-state-persistence-plan placeholders are machine-filled by
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
     The expose the crate handle and document the read-and-infer fence and ## Scope

- `engine/crates/vaultspec-session/src/lib.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# expose the crate handle and document the read-and-infer fence

## Scope

- `engine/crates/vaultspec-session/src/lib.rs`

## Description

- Replace the placeholder `lib.rs` with the crate's public handle `UserState`, opened from a vault root via `open` which best-effort heals the store.
- Re-export the domain types (`ScopeContext`, `Setting`, `MAX_RECENTS`, `Store`, `StoreError`, `Result`) and add convenience delegators for the full session and settings surface, plus a `store()` accessor.
- Author the crate-level module docs stating the read-and-infer fence explicitly: this crate persists only its own session/settings file and never writes `.vault/` documents, mutates git refs/trees/config, or grows sibling vault-CRUD/search semantics; the inference crates and serve read path stay untouched.

## Outcome

The crate now presents one public `UserState` handle over the best-effort store and the session and settings domains, with the read-and-infer fence and best-effort posture documented at the module root so a future reviewer reads the boundary in the source, not only in the ADR. The build and clippy are clean with no warnings.

## Notes

The session and settings methods live on the wrapped `Store` via one `impl` block per domain module; `UserState` exposes them both through thin delegators and through the `store()` accessor, so callers can use either surface without the handle hiding the domain API.