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
