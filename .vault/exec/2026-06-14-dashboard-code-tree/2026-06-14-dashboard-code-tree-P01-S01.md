---
tags:
  - '#exec'
  - '#dashboard-code-tree'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S01'
related:
  - "[[2026-06-14-dashboard-code-tree-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-code-tree with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S01 and 2026-06-14-dashboard-code-tree-plan placeholders are machine-filled by
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
     The Add the read-only GET /file-tree?scope=&path=&cursor= route returning one directory level beside the vault-tree handler and ## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the read-only GET /file-tree?scope=&path=&cursor= route returning one directory level beside the vault-tree handler

## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs`

## Description

- Resume a partially-built feature: the read-only `GET /file-tree?scope=&path=&cursor=&page_size=` route already exists in the working tree, authored by the prior code-tree executor.
- Assess the route against the ADR: it returns one directory level per call over the active worktree scope, resolves the scope through the shared `validate_scope` path, lists via the `ingest_git::file_tree::list_dir` substrate, and emits through the shared `envelope` helper.
- Confirm the route is registered in the router and in the `CONTRACT_ROUTES` inventory.

## Outcome

- Backend route verified working: the `/file-tree` integration suite passes end-to-end through the real router against a real git worktree.
- COMMITTED: none from this step alone. The route handler lives in a dedicated `routes/file_tree.rs` module (a cleaner choice than the plan's "beside the vault-tree handler in query.rs" hint); that new module file is committed under P02.S07, and the route registration in `routes/mod.rs` and the router in `lib.rs` are DEFERRED (entangled with peer pipeline-wire / workspace-registry edits).

## Notes

- ADR-vs-plan deviation accepted, not corrected: the plan row named `query.rs` as the route home, but the prior executor placed the handler in a dedicated `routes/file_tree.rs` module. This is cleaner (the vault-tree and file-tree handlers stay separable) and registration is correct; relocating into `query.rs` would be churn with no benefit and would entangle a clean new file with the heavily-peer-edited `query.rs`.
- DEFERRED COMMIT: `routes/mod.rs` (declares the module + route) and `lib.rs` (router wiring + `CONTRACT_ROUTES`) both carry heavy uncommitted peer work (dashboard-pipeline-wire `/pipeline`, `/ops/git`, `/nodes/{id}/plan-interior`; dashboard-workspace-registry `/workspaces`). A pathspec commit would absorb that peer work, so these are implemented in-tree and left uncommitted per the shared-worktree deferral policy.
