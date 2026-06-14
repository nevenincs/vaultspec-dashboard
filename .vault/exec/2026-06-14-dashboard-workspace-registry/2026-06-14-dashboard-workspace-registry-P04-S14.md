---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S14'
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
     The S14 and 2026-06-14-dashboard-workspace-registry-plan placeholders are machine-filled by
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
     The Widen the wholesale scope reset to also clear the cached worktree set on a workspace swap and ## Scope

- `frontend/src/stores/view/` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Widen the wholesale scope reset to also clear the cached worktree set on a workspace swap

## Scope

- `frontend/src/stores/view/`

## Description

- Add a `swapWorkspace(workspace, scope)` action to the view store: the full 022 cross-store reset (filter, lens, live-status, selection, working set, opened islands, pinned discoveries, timeline mode, granularity, folder context) WIDENED to re-key the pin and lens stores to the NEW WORKSPACE, not just the new scope — the load-bearing difference from `setScope`.
- Add a stores-layer `useSwapWorkspace` hook that invokes the view-store reset, clears the cached worktree set (removes the `/map`, `/vault-tree`, and `/graph` React-Query caches so the prior project's worktree set does not survive), and persists the active-workspace selection through `usePutSession`.

## Outcome

A workspace swap clears at least as much as a worktree swap plus the cached worktree set, so no cross-project residue bleeds. Proven by the P05 adversarial test: after a swap, the pin/lens stores are re-keyed to the new workspace and the prior project's pins/lenses are no longer the active membership.

## Notes

The pure cross-store reset lives in the view store (`stores/view/`) per the plan; the React-Query cache clear lives in the companion server-stores hook because that cache is the stores layer's, not the view store's. Together they are the workspace-level wholesale reset the ADR requires; the control owns no reset logic and only invokes the hook.
