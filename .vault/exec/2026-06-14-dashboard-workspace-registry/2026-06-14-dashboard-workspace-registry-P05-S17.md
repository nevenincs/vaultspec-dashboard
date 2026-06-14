---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S17'
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
     The S17 and 2026-06-14-dashboard-workspace-registry-plan placeholders are machine-filled by
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
     The Extend the scope-isolation adversarial tests to cover workspace swaps with no cross-project state bleed and ## Scope

- `frontend/src/stores/__adversarial__/` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Extend the scope-isolation adversarial tests to cover workspace swaps with no cross-project state bleed

## Scope

- `frontend/src/stores/__adversarial__/`

## Description

- Add an adversarial isolation test for the workspace swap (the 018/022/023 cross-scope class widened to the workspace level): pin a node and stamp per-scope view state under project A, swap to project B via `swapWorkspace`, and assert the full 022 reset ran AND the pin/lens stores re-keyed to workspace B so project A's pins/lenses are no longer the active membership.
- Add a second case proving a pin made under project B persists under B's key, never merged with A's stale pins.

## Outcome

Cross-project state bleed is guarded: the workspace swap is proven to clear at least as much as a worktree swap plus re-key pins/lenses to the new workspace. The test passes against the `swapWorkspace` implementation and would fail if the reset were narrowed to only flip the scope.

## Notes

The test exercises the pure view-store reset action directly (no React Query), isolating the cross-project-bleed invariant the way the existing isolation-01/02/03 adversarial tests isolate the worktree-swap invariant.
