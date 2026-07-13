---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S10'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# Expose the comments view and mutation hooks and the plan-step tick hook with bounded caches and tolerant adapters

## Scope

- `frontend/src/stores/server/queries.ts`

## Description

- Added `queries/comments.ts` (a new domain submodule of the decomposed queries barrel): `useDocumentComments(nodeId, scope)` — the bounded per-document comment listing keyed on `(scope, nodeId)` with explicit `staleTime`/`gcTime`, disabled until a document is open (the `useNodeContent`/`usePlanInterior` enabled-on-id mount-gating pattern), returning the raw query result for `useMemo` derivation at the call site.
- Added the comment mutation hooks `useCreateComment`/`useEditComment`/`useSetCommentResolved`/`useReanchorComment`/`useDeleteComment`, each threading the actor token via `requireActorToken()` and invalidating exactly the affected document's comment query on settle.
- Wired the comment SSE delta path with zero new stream code: the comment query key lives under `authoringKeys`, so the existing `invalidateAuthoring()` fired on every authoring lifecycle frame (including `comment.created/.updated/.deleted`) refreshes an open listing. `useDocumentComments` subscribes to the ref-counted authoring lifecycle stream while mounted so a comment created elsewhere reaches it.
- Added `usePlanStepTick` to `queries/mutations.ts`: routes the tick through `authoringClient.directWrite({operation: "set_plan_step_state", ...})`, returns a typed `PlanStepTickResult` (ticked/conflict/refused — denials are values, never thrown), and invalidates the vault-mutation read surfaces on a `ticked` outcome. The plan-interior projection is covered because it is a graph-generation subtree of `invalidateAfterVaultMutation`.
- Exported the new `comments` submodule from the queries barrel `index.ts`.

## Outcome

Comment reads/mutations and the plan tick are consumable as house-pattern hooks: raw selectors with bounded caches, `useMemo`-ready results, mount-gated fetches, and denials-as-values outcomes. `npx tsc --noEmit` and `eslint`/`prettier` are clean across the touched files.

## Notes

The originating Step names `queries.ts`, which has since been decomposed into the `queries/` barrel; the read hook landed in the new `comments` submodule and the plan-tick mutation alongside the other direct-write mutations in `mutations`, both re-exported unchanged through the barrel so the historical `./queries` import specifier resolves them.
