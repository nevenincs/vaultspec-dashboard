---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S05'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace review-rail-viewers with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S05 and 2026-06-16-review-rail-viewers-plan placeholders are machine-filled by
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
     The Register the route and add it to CONTRACT_ROUTES, bearer-gated by the existing middleware and ## Scope

- `engine/crates/vaultspec-api/src/lib.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Register the route and add it to CONTRACT_ROUTES, bearer-gated by the existing middleware

## Scope

- `engine/crates/vaultspec-api/src/lib.rs`

## Description

- Register the content module in the routes module tree.
- Wire `GET /nodes/{id}/content` into the router beside the rest of the nodes family, behind the existing bearer gate.
- Add `/nodes/{id}/content` to the `CONTRACT_ROUTES` inventory so the implementation and the contract drift loudly rather than silently.
- Add `ingest-struct` as a direct dependency for the body reader.

## Outcome

The route is registered, bearer-gated, and recorded in the contract inventory. The crate builds clean.

## Notes

The node-id path segment carries slashes for `code:<path>` ids; the client must percent-encode them into one segment, since axum captures a single path segment for `{id}`.
