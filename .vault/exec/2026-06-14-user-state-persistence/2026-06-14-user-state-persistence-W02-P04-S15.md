---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S15'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace user-state-persistence with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S15 and 2026-06-14-user-state-persistence-plan placeholders are machine-filled by
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
     The rewrite validate-scope to accept any selectable vault-bearing worktree in the workspace and ## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# rewrite validate-scope to accept any selectable vault-bearing worktree in the workspace

## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs`

## Description

- Rewrite `validate_scope` from a frozen single-value comparison into a registry
  resolve: it now calls `get_or_build`, which enumerates the workspace's
  worktrees, requires membership plus a present `.vault`, and returns the warm
  cell — building it on first access.
- Change `validate_scope`'s return type from unit to the resolved
  `Arc<ScopeCell>`, so every caller operates on the per-scope cell instead of a
  single frozen `AppState`.
- Keep the honest 400: an unknown or non-vault-bearing scope still returns a
  `BAD_REQUEST` carrying the tiers block, with the registry's membership-rejection
  reason as the message.
- Point `rag_tiers` at the resolved cell so the tiers reported per request
  reflect that scope's rag discovery and declared status.

## Outcome

Scope validation is now a real retarget: any selectable vault-bearing worktree
in the workspace resolves to its warm cell, while an arbitrary path 400s
honestly. The launch worktree resolves on the warm fast path; a sibling worktree
builds its cell on first access. The migrated scope-validation test passes.

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
