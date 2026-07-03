---
tags:
  - '#exec'
  - '#search-providers'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S01'
related:
  - "[[2026-07-03-search-providers-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace search-providers with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S01 and 2026-07-03-search-providers-plan placeholders are machine-filled by
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
     The Add the build_code_file_rows projection over all code-prefixed LinkageGraph nodes with the minimal row shape (path, node_id, title, lang), memoized per graph generation beside the vault-tree rows cache, with unit tests over a small ingested fixture and ## Scope

- `engine/crates/engine-query/src/graph.rs + vaultspec-api/src/app.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the build_code_file_rows projection over all code-prefixed LinkageGraph nodes with the minimal row shape (path, node_id, title, lang), memoized per graph generation beside the vault-tree rows cache, with unit tests over a small ingested fixture

## Scope

- `engine/crates/engine-query/src/graph.rs + vaultspec-api/src/app.rs`

## Description

- Add `build_code_file_rows` in `graph.rs` beside `build_vault_tree_rows`:
  project every `NodeKind::CodeArtifact` node off the code corpus `LinkageGraph`
  into the minimal row `{path, node_id, title, lang}`, path-sorted for cursor
  determinism.
- Derive `lang` from the path extension through the one
  `engine_model::language_token` source of truth (null for an unclassified
  extension); pass `title` through honestly (null when the node carries none).
- Add the `code_file_rows` per-generation memo to `CodeGraphCell` in `app.rs`:
  one cache slot keyed on the CODE generation, replaced on a bump, taking the
  caller-held graph Arc so the projection runs over exactly the generation read
  — the `default_rollup` discipline.
- Add three unit tests: code-only projection sorted by path (no `doc:`/`index`
  bleed), language derivation plus honest-null title/lang, and the empty
  listing on a graph with no code corpus.

## Outcome

The complete, filter-independent code-file listing is projected off the code
`LinkageGraph` (never the DOI-bounded graph slice) and memoized per code
generation. Row count equals the corpus file count (files-only representation:
one `code:{path}` node per admitted source file), so a client can hold the whole
set and narrow it. Gate green: `cargo fmt --all` clean, `cargo clippy -p
engine-query -p vaultspec-api --all-targets -- -D warnings` clean, the three new
`engine-query` unit tests pass.

## Notes

The memo lives on `CodeGraphCell` keyed on the CODE generation, not beside the
vault `vault_tree_rows_cache` on the vault `ScopeCell` as the step row's prose
suggested: the projection is over the code corpus's own graph and generation
counter, so memoizing on the vault generation would be incorrect (a code-tree
edit bumps the code generation without touching the vault one). This is the
faithful mirror of the memoization discipline, not a deviation from it.
