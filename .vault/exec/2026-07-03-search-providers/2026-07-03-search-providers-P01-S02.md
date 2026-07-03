---
tags:
  - '#exec'
  - '#search-providers'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S02'
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
     The S02 and 2026-07-03-search-providers-plan placeholders are machine-filled by
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
     The Serve GET /code-files: cursor pagination at 2000 per page, the tiers envelope on success and error, and an honest truncated block when the ingest walk cap bounded the corpus, registered in the contract route table and ## Scope

- `engine/crates/vaultspec-api/src/routes/ + lib.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Serve GET /code-files: cursor pagination at 2000 per page, the tiers envelope on success and error, and an honest truncated block when the ingest walk cap bounded the corpus, registered in the contract route table

## Scope

- `engine/crates/vaultspec-api/src/routes/ + lib.rs`

## Description

- Add the `code_files` handler in `query.rs` as the twin of `vault_tree`:
  validate scope, lazily `ensure_fresh` the code corpus off the async runtime
  (blocking walk/parse) mirroring the code graph query, then serve the complete
  per-generation-memoized listing.
- Paginate with the shared `paginate` helper keyed on `path`, page size clamped
  `unwrap_or(500).min(2000)` exactly like `/vault-tree` so a client page_size
  cannot defeat the cursor cap; `next_cursor` rides the envelope's third arg.
- Emit an honest `truncated` block only when the ingest walk cap bounded the
  corpus (`ExtractionStats.capped`), stating the returned file count and the
  reason; null when the walk ran to completion.
- Register `/code-files` in the router, `CONTRACT_ROUTES`, and the `spa.rs`
  `API_PREFIXES` bearer boundary so the route is gated and the drift guards
  stay green.

## Outcome

`GET /code-files?scope=&cursor=&page_size=` serves the complete cursor-paginated
code-file listing through the shared tiers envelope on success and error, with
walk-cap truncation stated honestly. Wire shape:
`{entries: [{path, node_id, title, lang}], next_cursor, truncated}`. Gate green:
`cargo fmt --all` clean, `cargo clippy -p vaultspec-api --all-targets -- -D
warnings` clean, all 325 `vaultspec-api` lib tests pass — including the
`every_registered_route_is_in_CONTRACT_ROUTES` and bearer-gate drift guards that
would have failed had the registration or the security boundary been incomplete.

## Notes

The walk-cap `truncated` block is sourced from the honest counters the code
corpus already records (`ExtractionStats.capped` on `CodeGraphCell.stats`, read
via `stats_snapshot()`) — no fabrication and no new plumbing was needed; the gap
the plan flagged as a possible residual does not exist. The block reports
`returned_files` (what was listed) rather than a total, because a capped walk
genuinely does not know how many files lie beyond its ceiling; claiming a total
would be a guess. This walk-cap truncation is orthogonal to the per-page
`next_cursor` (page-boundary continuation, not incompleteness).
