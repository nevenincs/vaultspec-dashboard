---
tags:
  - '#exec'
  - '#feature-group-authoring'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S05'
related:
  - "[[2026-07-14-feature-group-authoring-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace feature-group-authoring with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S05 and 2026-07-14-feature-group-authoring-plan placeholders are machine-filled by
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
     The Memoize the projection per graph generation on the corpus cell beside filters_vocabulary, invalidated on watcher rebuild and ## Scope

- `engine cell memo site beside filters_vocabulary` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Memoize the projection per graph generation on the corpus cell beside filters_vocabulary, invalidated on watcher rebuild

## Scope

- `engine cell memo site beside filters_vocabulary`

## Description

- Add a `feature_coverage_cache` field to the scope cell alongside
  `filters_vocab_cache` and `pipeline_cache`: a mutex holding the generation-keyed
  `Arc<CoverageMap>`, documented like its peers.
- Initialize the new cache to empty in the cell constructor beside the sibling
  caches.
- Add a `feature_coverage` accessor mirroring `filters_vocabulary` exactly: read
  the current generation, return the cached map on a generation hit, else build
  `engine_query::features::coverage_map` over the current graph, store it under the
  generation, and return the fresh `Arc`.
- Add a per-generation memoization test asserting a repeat read is the same `Arc`
  and content survives a no-op rebuild, matching the existing vocabulary and
  pipeline memo tests.

## Outcome

The memo compiles and its test passes
(`cargo test -p vaultspec-api --lib feature_coverage_is_memoized`, 1 passed).
`cargo fmt` and `cargo clippy` for the crate are clean. Repeat panel reads are now
warm-cache hits invalidated only on a watcher rebuild, so the coverage projection
never re-scans every document node per poll.

## Notes

Judgment calls recorded here:

- One cached `CoverageMap` serves both shapes (per-feature read and roster) rather
  than memoizing per-feature entries, as the step contract permits. The map is the
  natural memoization unit because the route derives both the single-feature
  coverage and the roster from it, and it is already bounded by the roster cap, so
  a single generation-keyed structure keeps the analogue's cache-until-invalidated
  idiom clean with no per-key cache bookkeeping.
- The accessor is deliberately NOT added to `warm_projections`. Feature coverage
  is a panel-triggered read, not part of the default view (unlike the filter
  vocabulary, which the timeline auto-fit reads on load), so warming it eagerly
  would be wasted work for the common session that never opens the create-doc
  panel. The lazy getter stays the correctness floor, the same posture
  `document_views` takes for a drill-in-only projection.
