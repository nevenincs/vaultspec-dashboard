---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S22'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# Author the vault-doc copy-link action descriptor producing a deep link with heading anchor when block-invoked, enrolled across menus and palette

## Scope

- `frontend/src/app/menus`

## Description

- Author one shared `copyLinkAction` builder under the single id `vault-doc:copy-link`, dispatching the wire-free platform copy verb with a `run` (never a `dispatch`) so the one descriptor is valid on both the menu and the palette.
- Copy the app's only navigable document reference — the Obsidian-style wiki-link `[[stem]]` — since no document URL/route scheme exists; support an optional heading slug for a section anchor when block-invoked.
- Enrol it on the vault-doc context-menu resolver in the copy section beside copy-path/copy-stem.
- Enrol it on the palette via a new document command provider, wired to a new optional `activeDocumentStem` on the command context so the verb appears only when a document is open.
- Add the reverse `doc:{stem}` grammar helper to the grammar owner so the palette can resolve the active document's stem without duplicating the prefix logic.

## Outcome

Copy-link is reachable from both the row menu and Cmd+K under one id, appearing on the palette only when a document tab is active. Menu-resolver test, palette-provider test, and a pure builder/wiki-link unit test are green.

Modified files:

- `frontend/src/stores/view/documentLinkActions.ts` (new)
- `frontend/src/stores/view/documentLinkActions.test.ts` (new)
- `frontend/src/stores/view/commandProviders/documentCommandProvider.ts` (new)
- `frontend/src/stores/view/commandProviders/documentCommandProvider.test.ts` (new)
- `frontend/src/stores/view/commandPaletteCommands.ts`
- `frontend/src/stores/view/commandRegistry.ts`
- `frontend/src/stores/server/liveAdapters/historyIdentity.ts`
- `frontend/src/app/left/menus/vaultDocMenu.ts`
- `frontend/src/app/left/menus/leftMenus.test.ts`
- `frontend/src/app/menus/registerAllCommands.ts`
- `frontend/src/app/viewer/remarkWikiLink.ts` (review MEDIUM fix)
- `frontend/src/app/viewer/remarkWikiLink.test.ts` (new, review MEDIUM fix)

## Notes

No document deep-link URL exists in the app; the copied reference is the vault's wiki-link form, which the reader's navigation already resolves.

Review follow-up (MEDIUM, landed): the reader's wiki-link resolver could not round-trip the section-anchor form this verb emits — `[[stem#slug]]` had its `#fragment` folded into the stem and resolved to no node. The resolver now splits the fragment before resolving so the stem still resolves (the fragment is reserved for future scroll-to-section), closing the trap before any block-invocation caller emits the form; a resolver test covers `[[stem#heading]]` → `doc:stem`. Reviewer confirmed the `activeDocumentStem` context addition (optional, so existing fixtures are unaffected) as the doc-scoped palette seam.
