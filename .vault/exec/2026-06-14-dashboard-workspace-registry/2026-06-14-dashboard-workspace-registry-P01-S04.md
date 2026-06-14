---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S04'
related:
  - "[[2026-06-14-dashboard-workspace-registry-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-workspace-registry with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S04 and 2026-06-14-dashboard-workspace-registry-plan placeholders are machine-filled by
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
     The Implement read-only add, forget, and select-active registry operations that never mutate a repository and ## Scope

- `engine/crates/vaultspec-session/src/session.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Implement read-only add, forget, and select-active registry operations that never mutate a repository

## Scope

- `engine/crates/vaultspec-session/src/session.rs`

## Description

- Add `list_roots` and `root` reads returning registry rows in stable position order.
- Add `add_root` upsert that appends a new root at the end of the order and refreshes an existing root's label, path, and reachability in place without reshuffling its position.
- Add `set_root_reachability` to record a moved or missing root as degraded rather than dropping it.
- Add `forget_root` returning a typed refusal when forgetting the last launch root and otherwise deleting only the registry row.
- Add `active_workspace` and `set_active_workspace` over the global-settings kv surface, plus the `RegistryError` type and the public `UserState` delegators.

## Outcome

The registry's read-only add, forget, and select-active operations are complete and unit-tested. Every operation writes only config rows in the best-effort store and never clones, inits, creates, deletes, or otherwise mutates a repository, a worktree, a branch, or any file on disk; forgetting is a config-row delete, and the last-launch-root refusal is a config-level refusal, not a disk operation.

## Notes

Forget returns a nested `Result<Result<(), RegistryError>>` so a genuine store error and an operator refusal are distinct, and a forget of an unknown id is a harmless no-op. The caller is responsible for evicting any warm scope cells a forgotten root owned (handled at the route layer in P02).
