---
tags:
  - '#exec'
  - '#dashboard-code-tree'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S07'
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
     The S07 and 2026-06-14-dashboard-code-tree-plan placeholders are machine-filled by
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
     The Define the file-tree response wire contract types and ## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Define the file-tree response wire contract types

## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs`

## Description

- Verify the file-tree response wire contract is fully defined: the `FileTreeParams` query shape (`scope`, optional `path`, `cursor`, `page_size`), the `ChildEntry` listing record in `ingest-git`, and the wire body `{entries: [{path, kind, has_children, node_id}], path, truncated, (next_cursor), tiers}`.
- Define the matching frontend wire types (`FileTreeEntry`, `FileTreeTruncated`, `FileTreeResponse`) so the SPA consumes the contract type-safely.

## Outcome

- COMMITTED (code-tree-exclusive new files):
  - `engine/crates/ingest-git/src/file_tree.rs` (the `ChildEntry` record + bounded ignore-aware `list_dir`) plus its one-line `pub mod file_tree;` in `ingest-git/src/lib.rs`.
  - `engine/crates/vaultspec-api/src/routes/file_tree.rs` (the route module, `FileTreeParams`, `child_to_wire`, the bounded/paginated handler).
  - `engine/crates/vaultspec-api/tests/file_tree.rs` (the integration contract coverage).
- DEFERRED (entangled): the frontend wire types added to `frontend/src/stores/server/engine.ts` (heavy peer pipeline-wire / workspace-registry edits in the same file).

## Notes

- The Rust wire contract lives in the dedicated `routes/file_tree.rs` module, not in `query.rs` as the plan row hinted (see P01.S01 note) — a cleaner separation that also keeps the new file committable in isolation rather than entangled with the heavily-peer-edited `query.rs`.
- The frontend `FileTreeResponse` mirrors the wire exactly, including `next_cursor` (which rides at the envelope top level, sibling of `data`).
