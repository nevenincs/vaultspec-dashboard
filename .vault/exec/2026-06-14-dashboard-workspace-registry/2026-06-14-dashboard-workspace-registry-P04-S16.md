---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S16'
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
     The S16 and 2026-06-14-dashboard-workspace-registry-plan placeholders are machine-filled by
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
     The Host the workspace switcher above the worktree switcher and render it as a quiet header when only one root exists and ## Scope

- `frontend/src/app/AppShell.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Host the workspace switcher above the worktree switcher and render it as a quiet header when only one root exists

## Scope

- `frontend/src/app/AppShell.tsx`

## Description

- Import the `WorkspacePicker` into the app shell and host it ABOVE the worktree switcher in the left scope rail, separated by the same rule divider, so the rail composes which PROJECT, then which worktree, then which document.
- The picker renders as a quiet header when only one root is registered (the single-project case stays uncluttered), and as an expandable picker otherwise — that quiet-header behaviour is owned by the picker itself, so the host just places it.

## Outcome

The host wiring is complete in the working tree and the full frontend suite, lint, format, and typecheck are green with the picker hosted. The left rail now offers the workspace switcher above the worktree switcher per the left-rail IA.

## Notes

COMMIT DEFERRED (not a code problem): the app-shell file carries uncommitted peer WIP from a concurrent campaign (a right-activity-rail "work" tab) interleaved in the SAME file. My left-rail edit is line-disjoint from that WIP, but committing the file with an explicit pathspec would absorb the peer's uncommitted changes into this commit, which the shared-worktree safety discipline forbids (and stash/reset/add-p are forbidden). The host edit is therefore left in the working tree and this step is held OPEN until the peer commits their app-shell WIP, at which point the host edit can be committed cleanly. This is recorded for the next executor in the handoff. The picker and all stores work it depends on are committed; only the one-line host placement awaits the peer commit.
