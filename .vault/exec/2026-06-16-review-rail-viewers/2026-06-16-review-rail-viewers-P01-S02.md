---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S02'
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
     The S02 and 2026-06-16-review-rail-viewers-plan placeholders are machine-filled by
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
     The Implement GET /nodes/{id}/content: validate scope, guard path traversal, read bytes via read_from_worktree/read_from_ref, derive language_hint from extension and ## Scope

- `engine/crates/vaultspec-api/src/routes/content.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Implement GET /nodes/{id}/content: validate scope, guard path traversal, read bytes via read_from_worktree/read_from_ref, derive language_hint from extension

## Scope

- `engine/crates/vaultspec-api/src/routes/content.rs`

## Description

- Implement the `node_content` handler: validate an explicit scope through the shared validate-scope path, or fall back to the active scope per the nodes-family convention.
- Guard the resolved path against traversal with `guard_within_root` before any disk read, rejecting `..` and absolute components, mirroring the file-tree resolve-within-root discipline.
- Read bytes via `read_from_worktree` for a worktree scope and `read_from_ref` for a ref-only scope, mapping a missing-at-ref read to a not-found request error.
- Derive `language_hint` from the path extension across the full required language set so the client picks the grammar without re-parsing.

## Outcome

The handler resolves the scope, guards traversal, reads from the correct substrate, and derives the language hint. Tests confirm traversal rejection and the language-hint mapping.

## Notes

None.
