---
tags:
  - '#exec'
  - '#dashboard-code-tree'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S05'
related:
  - "[[2026-06-14-dashboard-code-tree-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-code-tree with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S05 and 2026-06-14-dashboard-code-tree-plan placeholders are machine-filled by
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
     The Degrade honestly for a remote-ref scope or absent structural tier while carrying the tiers block and ## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Degrade honestly for a remote-ref scope or absent structural tier while carrying the tiers block

## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs`

## Description

- Verify honest degradation: an unknown / non-worktree (remote-ref-style) scope is refused through the shared `validate_scope` path with a tiered 400, and a worktree whose working tree cannot be listed degrades the `structural` tier (via `degraded_tiers_for(cell, "structural", reason)`) with an empty level rather than a healthy-looking populated one or a bare error.
- Confirm a traversal/escape path is treated as a malformed REQUEST (a tiered 400), distinct from degradation, and that every response — success and error — carries the tiers block through the shared envelope.

## Outcome

- Verified: the integration suite asserts an unknown scope 400s with the tiers block, a traversal path 400s with the tiers block, and the structural-degrade path returns an empty level under a `structural` unavailable tier.
- COMMITTED: the degradation logic lives in `routes/file_tree.rs` (P02.S07); the shared `degraded_tiers_for` helper edit lives in the DEFERRED `routes/mod.rs`.

## Notes

- DEFERRED COMMIT: `routes/mod.rs` (which gained the `degraded_tiers_for` per-request single-tier degrade helper, mirroring `query_tiers` / `degraded_tiers`) is entangled with peer edits in the same file and is left uncommitted. The helper is small and additive; it overlays one named tier as unavailable onto the real declared-tier status, so the code mode renders a designed degraded state.
- The remote-ref case is realized as the scope-validation 400: a remote ref has no selectable worktree, so it never resolves to a file-tree, and the honest refusal is the tiered 400. This matches the contract (`/map` marks remote refs `degraded: ["structural"]`).
