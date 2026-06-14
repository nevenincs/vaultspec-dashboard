---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S11'
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
     The S11 and 2026-06-14-dashboard-workspace-registry-plan placeholders are machine-filled by
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
     The Change validate_scope to resolve a worktree against the active workspace's enumerable worktrees and ## Scope

- `engine/crates/vaultspec-api/src/app.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Change validate_scope to resolve a worktree against the active workspace's enumerable worktrees

## Scope

- `engine/crates/vaultspec-api/src/app.rs`

## Description

- Add an `active_workspace_root` helper to the app state: it reads the active-workspace id from the user-state config and returns its registered root path, falling back to the launch workspace root when no registry selection exists.
- Change the scope-validation membership check to discover and enumerate the active workspace's worktrees instead of the frozen launch workspace, so a requested worktree is resolved against the active workspace's enumerable worktrees.
- Update the refusal messages to name the active workspace honestly.

## Outcome

Scope routing follows the active workspace: a worktree of a non-active workspace is not selectable until that workspace is made active, and the single-workspace behaviour is unchanged because the active workspace defaults to the launch workspace. Proven by a route-level test that switches the active workspace and validates a sibling worktree only after the switch.

## Notes

The change is read-only over repository content (discover + enumerate), keeping the read-and-infer fence intact. The helper lives on the app state per the plan's file intent; the membership check it feeds lives in the warm-scope module where the symbol already was.
