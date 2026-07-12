---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S09'
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
     The S09 and 2026-07-12-authoring-surface-plan placeholders are machine-filled by
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
     The Extend the authoring wire client with comment reads and mutations plus the plan-step set-state mutation, invalidating the plan-interior and comment queries on settle and ## Scope

- `frontend/src/stores/server/authoring.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Extend the authoring wire client with comment reads and mutations plus the plan-step set-state mutation, invalidating the plan-interior and comment queries on settle

## Scope

- `frontend/src/stores/server/authoring.ts`

## Description

- Added the section-anchored comment served vocabulary + tolerant adapters to the authoring wire client: `SectionSelector`, `CommentAnchorState` (tagged `state`), `CommentOrphanEvidence` (tagged `reason`), `CommentRecord`, `ServedComment`, `CommentListResult`, plus `adaptCommentRecord`/`adaptServedComment`/`adaptCommentList` that floor optionals and derive the served `orphaned` flag from the tagged anchor when a wire omits it.
- Added four comment methods to `AuthoringClient`: `listComments` (principal-permissive GET), `createComment` (POST, node id on the route, body `{selector, body}`), `updateComment` (PATCH, tagged edit/resolve/reanchor op), and `deleteComment` (DELETE, idempotent). Refactored `postJson` to delegate to a generic `sendJson(method, ...)` so PATCH/DELETE carry the command envelope the same way POST does.
- Extended the `DirectWritePayload` union + `directWriteWirePayload` marshaller with the `set_plan_step_state` variant (plan `ref`, `planStep {stepId, state}`, `expected_blob_hash` engine-side stale-base fence), reusing the existing `directWrite` outcome path.
- Added `authoringKeys.comments(scope, nodeId)` under the `authoring` prefix so the existing lifecycle-stream invalidation refreshes an open comment listing for free.

## Outcome

The stores layer is the sole wire client for the D2 comment plane and the D1 plan-step tick. The comment routes serve typed errors (not denial values), so create/edit/delete resolve to the record/flag and throw a tiers-bearing `EngineError` on a genuine refusal; the plan tick rides the existing denials-are-values direct-write outcome. `npx tsc --noEmit` and `eslint`/`prettier` are clean on the touched file.

## Notes

The comment create takes NO document path — the node id rides the route and the backend derives the confined worktree path from it (the W01.P02 HIGH fix); the client honors that by placing the node id in the URL and sending only `{selector, body}`.
