---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S32'
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
     The S32 and 2026-06-14-user-state-persistence-plan placeholders are machine-filled by
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
     The represent the current folder and its feature-tag contexts as a view selector and ## Scope

- `frontend/src/app/left/browserSelection.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# represent the current folder and its feature-tag contexts as a view selector

## Scope

- `frontend/src/app/left/browserSelection.ts`

## Description

- Added `featureContextsFor`, a pure projection that derives the distinct
  feature-tag contexts present in a folder (a `.vault/` doc-type group) from the
  vault-tree entries' `feature_tags`, in stable first-seen order — built on the
  existing grouping primitive, NOT a new node model.
- Added `useScopeContextSelection`, a pure read of the current folder + feature
  contexts from the view store (the projection mirrored from the restored
  session) — no fetch, no raw tiers read.
- Added `useSelectFolderContext`, which mirrors a folder/context choice into the
  view store (`setScopeContext`) for synchronous reads AND persists it durably via
  `usePutSession({ scope_context })`, scoped to the active worktree — the durable
  home is the session, never localStorage.

## Outcome

The "current folder + contexts" concept is now a view selector projected over
`feature_tags` and the `/vault-tree` subtree, persisted through the session API.
The existing browserSelection suite stays green.

## Notes

This honors views-are-projections-of-one-model: no new endpoint, no new fetch, no
new node schema — only a projection over the one model plus a session-scoped
persist. No skips, no stubs.
