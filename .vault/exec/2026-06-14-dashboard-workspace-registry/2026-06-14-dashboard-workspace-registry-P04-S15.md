---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S15'
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
     The S15 and 2026-06-14-dashboard-workspace-registry-plan placeholders are machine-filled by
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
     The Author the WorkspacePicker rendering roots, launch-default and unreachable markers, and the add-a-project affordance and ## Scope

- `frontend/src/app/left/WorkspacePicker.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Author the WorkspacePicker rendering roots, launch-default and unreachable markers, and the add-a-project affordance

## Scope

- `frontend/src/app/left/WorkspacePicker.tsx`

## Description

- Author the `WorkspacePicker` chrome component: renders the registered roots with the launch-default marker (Lucide star) and an unreachable marker (Lucide warning with its reason), the active root marked by a grayscale-safe accent bar plus fill and weight, and the path as monospace identity on hover.
- Render as a quiet header (the project name plus the add-a-project affordance) when only one root is registered, and as an expandable picker when two or more exist.
- Add the add-a-project affordance: an absolute-path input that registers through the session mutation and surfaces the engine's validation refusal as a non-silent status line; plus a keyboard contract (arrow/Enter/Escape) over the roving row focus.
- Invoke the stores' `useSwapWorkspace` on selection (optimistic + durable), surfacing a rejected switch as the same status line.

## Outcome

The switcher reads the registry, the active marker, and degradation only through stores hooks, defines no workspace shape of its own, never fetches the engine, and invokes the stores swap action — chrome over the one projection, honoring the layer-ownership law. Its four honest states plus the add-refusal are proven by the P05 render test.

## Notes

The control owns no reset logic; the workspace-level wholesale reset lives in the stores `useSwapWorkspace`, exactly as the worktree switcher delegates to `setScope`.
