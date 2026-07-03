---
tags:
  - '#exec'
  - '#search-providers'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S03'
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
     The S03 and 2026-07-03-search-providers-plan placeholders are machine-filled by
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
     The Cover the new route with wire tests: full cursor walk to completion, page-boundary determinism, truncation honesty, and tier parity on a graphless cell and ## Scope

- `engine/crates/vaultspec-api/tests/` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Cover the new route with wire tests: full cursor walk to completion, page-boundary determinism, truncation honesty, and tier parity on a graphless cell

## Scope

- `engine/crates/vaultspec-api/tests/`

## Description

- Add the `code_files` wire test module, driven end-to-end through the real
  router against real temp worktrees (no mocks), mirroring the code-corpus
  harness: a polyglot fixture (four source files + one ignored vault doc) and a
  vault-only fixture (zero source files).
- Cover the full cursor walk to completion: a `walk_all` helper pages the cursor
  and asserts the reconstructed listing equals the complete single-page
  projection (the four path-sorted files; the vault doc and the `.toml` manifest
  never appear), and asserts the minimal row shape (`node_id`, derived `lang`,
  `title`).
- Cover page-boundary determinism at `page_size` 2 and 1: the paged walk equals
  the whole listing with no duplicate crossing a boundary and no entry skipped.
- Cover truncation honesty: `truncated` is present-and-null when the walk ran to
  completion (the fixture is far below the walk ceiling).
- Cover tier parity: a code-graphless cell serves an empty listing with an
  honest tiers block at HTTP 200 (never a 5xx), and an unknown scope is a typed
  400 whose error envelope still carries tiers.

## Outcome

Five wire tests green, all exercising the live router. The full plan-verification
run is clean: `cargo test -p engine-query -p vaultspec-api` passes (engine-query
138 unit + vaultspec-api 325 lib + the 5 new `code_files` wire tests + all
existing integration suites), `cargo fmt --all` clean, `cargo clippy -p
engine-query -p vaultspec-api --all-targets -- -D warnings` clean.

## Notes

Positive walk-cap truncation (a non-null `truncated` block) is asserted at the
unit level through the honesty flag, not wire-forced: the walk ceiling is 50,000
files and the route uses the default caps (not injectable through the request),
so materializing a capped corpus in a wire test is impractical. The
`capped → truncated` mapping is exercised by `ingest-code`'s own walk tests
(which cap at three files) and the route's read of `ExtractionStats.capped`; the
wire test asserts the honest null-completeness case that the fixture actually
produces, never a fabricated positive block.
