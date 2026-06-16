---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S04'
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
     The S04 and 2026-06-16-review-rail-viewers-plan placeholders are machine-filled by
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
     The Degrade the structural tier on an unreadable worktree and return a tiered 400 on traversal or missing path via degraded_tiers_for and api_error and ## Scope

- `engine/crates/vaultspec-api/src/routes/content.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Degrade the structural tier on an unreadable worktree and return a tiered 400 on traversal or missing path via degraded_tiers_for and api_error

## Scope

- `engine/crates/vaultspec-api/src/routes/content.rs`

## Description

- Add `content_error` mapping each resolution failure to the right tiered response: malformed id, traversal, and non-content node kinds are tiered 400s; an unknown doc stem or missing-at-ref path is a tiered 404.
- Degrade the structural tier honestly via `degraded_tiers_for` when the worktree substrate cannot read the resolved path, returning a tiered 400 with the structural reason rather than a bare 500.

## Outcome

The 400-vs-degrade split mirrors the file-tree route. Tests confirm a traversal 400, a structural degradation on an unreadable path, an unknown-stem 404, and a non-content-node 400, all carrying the tiers block.

## Notes

None.
