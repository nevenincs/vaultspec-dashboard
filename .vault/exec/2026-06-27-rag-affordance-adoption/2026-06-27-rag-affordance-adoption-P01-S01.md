---
tags:
  - '#exec'
  - '#rag-affordance-adoption'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S01'
related:
  - "[[2026-06-27-rag-affordance-adoption-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace rag-affordance-adoption with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S01 and 2026-06-27-rag-affordance-adoption-plan placeholders are machine-filled by
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
     The Prepend the storage-parent machine-global pointer to service_json_candidates and update the precedence comment and ## Scope

- `engine/crates/rag-client/src/client.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Prepend the storage-parent machine-global pointer to service_json_candidates and update the precedence comment

## Scope

- `engine/crates/rag-client/src/client.rs`

## Description

- Prepended rag's STATUS_DIR-independent machine pointer (`~/.vaultspec-rag/qdrant-server/service.json`, beside the lock) as the FIRST candidate in `service_json_candidates`, ahead of the STATUS_DIR-default file and the per-scope fallback.
- Updated the precedence comment to record that the previously-deferred STATUS_DIR-independent pointer is now adopted (the rag pointer shipped, coordination done).

## Outcome

Discovery survives a non-default rag STATUS_DIR by consulting the machine-global pointer first; purely additive (an absent pointer is skipped by `discover_at`).

## Notes

The `qdrant-server` subdir couples to rag's default storage layout, matching the existing hardcode of `.vaultspec-rag/service.json`.
