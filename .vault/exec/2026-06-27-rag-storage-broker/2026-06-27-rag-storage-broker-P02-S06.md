---
tags:
  - '#exec'
  - '#rag-storage-broker'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S06'
related:
  - "[[2026-06-27-rag-storage-broker-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace rag-storage-broker with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S06 and 2026-06-27-rag-storage-broker-plan placeholders are machine-filled by
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
     The Add the ops_rag_storage route validating the body, gating apply to --yes versus the default --dry-run, and running the storage-aware runner and ## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the ops_rag_storage route validating the body, gating apply to --yes versus the default --dry-run, and running the storage-aware runner

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Added the `ops_rag_storage` route: looks the verb up in `RAG_STORAGE_CLI_WHITELIST` (403 if absent), takes the active cell, assembles the validated argv via `storage_args_for` (400 on a bad argument), and runs `run_storage_sibling_bounded` in the cell root, returning rag's envelope verbatim with the tiers block.

## Outcome

The destructive verbs are reachable through one validated, dry-run-default, tiers-honest route; a forbidden verb 403s and a malformed argument 400s before any subprocess.

## Notes

delete/prune are machine-scoped (no `project_root` derivation); migrate's root is the active cell, sourced inside `storage_args_for`.
