---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S27'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# Render and guard tests for every new affordance: single-descriptor law, coverage guards, compact variants

## Scope

- `frontend/src/app`

## Description

- Assert the single-descriptor law: every create affordance resolves to the one shared new-document id whatever its prefill/focus options, and the Features variant sets the open-plus-focus intent.
- Assert copy-link is present on the vault-doc menu (updated the exact-id-list guard) and on the palette only when a document is active.
- Cover the wiki-link format and the copy-link builder's runnable/disabled shapes as a pure unit.
- Cover the DocChrome accelerator hints (derived keycaps + segment tooltips).
- Cover the workspace New-document button, the browser-region Plus vault-mode gating, the create combobox role, the feature-field focus request, and free-text commit; a live-engine test covers corpus suggestion.

## Outcome

Every new affordance has render or guard coverage; the touched suites are green.

Modified files:

- `frontend/src/app/viewer/DocChrome.render.test.tsx` (new)
- `frontend/src/app/stage/WorkspaceGhost.render.test.tsx` (new)
- `frontend/src/app/left/BrowserRegion.render.test.tsx` (new)
- `frontend/src/app/left/CreateDocDialog.render.test.tsx`
- `frontend/src/app/left/menus/leftMenus.test.ts`
- `frontend/src/stores/view/documentLinkActions.test.ts` (new)
- `frontend/src/stores/view/newDocumentAction.test.ts` (new)
- `frontend/src/stores/view/commandProviders/documentCommandProvider.test.ts` (new)
- `frontend/src/app/viewer/remarkWikiLink.test.ts` (new, review MEDIUM fix)
- `frontend/src/app/newDocumentAffordances.guard.test.tsx` (new, review LOW follow-up)

## Notes

Store-connected surfaces are tested with a no-scope seeded QueryClient (a sanctioned deterministic-render technique, not a wire mock) for the structural contracts, and against the real engine over the fixture vault for the corpus-listing and Features-section-Plus contracts.

Review follow-ups (landed): the wiki-link resolver anchor-round-trip test (MEDIUM, with the resolver fix recorded under S22); a closed-list Enter-to-submit assertion added to the create-dialog suite (LOW); and a dedicated guard asserting all three new create buttons — the workspace empty-state button, the browser-region Plus, and the Features-section Plus — route through the shared new-document action by their observable store-open effect (LOW). After the parallel W03.P06 editor-slice signature migration landed, the whole-tree gate is fully green: eslint, px-scan, module-size, prettier, tsc, tokens, and figma:names all pass.
