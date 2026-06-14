---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S09'
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
     The S09 and 2026-06-14-dashboard-workspace-registry-plan placeholders are machine-filled by
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
     The Route registry add and forget through the user-state config surface, not the graph API or the ops proxy and ## Scope

- `engine/crates/vaultspec-api/src/routes/session.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Route registry add and forget through the user-state config surface, not the graph API or the ops proxy

## Scope

- `engine/crates/vaultspec-api/src/routes/session.rs`

## Description

- Add `add_workspace` and `forget_workspace` to the PUT `/session` update body, routing both through the user-state config surface, not the read-only graph API and not the `/ops` proxy.
- Add a read-only `register_root` helper: it discovers the operator-supplied path as a git workspace and enumerates its worktrees to validate it, derives the stable id from the canonical git common dir, and records one registry config row; it refuses an invalid path honestly and never partially registers.
- Add a `forget_root` helper: it removes the registry config row, surfaces the last-launch-root refusal as a tiered 400, and evicts any warm scope cells under the forgotten workspace's root subtree.
- Add an `evict_where` predicate eviction to the warm scope registry for the forget path.

## Outcome

Registry add and forget are exposed only through the config surface and are read-only over repository content. A route test registers a real sibling git workspace, asserts the sibling repo's commit count is unchanged (registration never mutated it), lists it, forgets it, and a second test asserts the last-launch-root refusal carries the tiers block.

## Notes

Forget evicts warm cells by root-subtree prefix match (never the pinned active scope); a forget of the active workspace is preceded by the frontend's active re-point, so the pinned scope is re-selected before any eviction.
