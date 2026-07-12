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

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace authoring-surface with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S10 and 2026-07-12-authoring-surface-plan placeholders are machine-filled by
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
     The Expose the comments view and mutation hooks and the plan-step tick hook with bounded caches and tolerant adapters and ## Scope

- `frontend/src/stores/server/queries.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
