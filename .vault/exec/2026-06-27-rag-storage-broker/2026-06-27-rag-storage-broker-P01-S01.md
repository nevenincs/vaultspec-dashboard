---
tags:
  - '#exec'
  - '#rag-storage-broker'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S01'
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
     The S01 and 2026-06-27-rag-storage-broker-plan placeholders are machine-filled by
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
     The Add the RAG_STORAGE_CLI_WHITELIST mapping storage-delete, storage-prune, and storage-migrate to their fixed rag base args and ## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the RAG_STORAGE_CLI_WHITELIST mapping storage-delete, storage-prune, and storage-migrate to their fixed rag base args

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Added `RAG_STORAGE_CLI_WHITELIST` mapping `storage-delete`/`storage-prune`/`storage-migrate` to their fixed rag base args (`server storage <verb>`), in its own whitelist (separate from the lifecycle `RAG_CLI_WHITELIST`) because these take validated arguments and a destructive gate the lifecycle verbs do not.

## Outcome

The destructive storage verbs have a dedicated CLI whitelist; rag exposes them CLI-only, so they run on the bounded subprocess runner like the lifecycle verbs.

## Notes

None.
