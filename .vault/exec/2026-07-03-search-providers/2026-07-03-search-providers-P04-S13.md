---
tags:
  - '#exec'
  - '#search-providers'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S13'
related:
  - "[[2026-07-03-search-providers-plan]]"
---

# Make the document finder a thin consumer of the files-vault provider, deleting its private matcher in favor of the shared utility while keeping its keybinding and focused-plane behavior

## Scope

- `frontend/src/stores/server/documentSearchController.ts + app/palette/DocumentSearchSurface.tsx`

## Description

- Delete the finder's private `matchDocumentEntries` scanner; rewrite
  `useDocumentSearchController` as a thin consumer of `useFilesVaultProvider` —
  unwrap the provider's banded entries to the finder's `SearchResult` list and
  derive the honest phase from the provider's tiers-gated state via the retained
  pure `deriveDocumentSearchState`.
- Keep the finder's contract intact: the `DocumentSearchView` shape
  (`results` / `state` / `count`), `DOCUMENT_SEARCH_RESULTS_MAX`, and the state
  vocabulary are unchanged, so `DocumentSearchSurface` (its keybinding and
  focused-plane behavior) needs no change.
- Trim `documentSearchController.test.ts` to the state-derivation contract; the
  matching coverage now lives with the shared `literalMatch` / `searchProviders`
  vectors.

## Outcome

The document finder and the unified Search palette now share ONE matcher and one
band policy over the same complete cached vault tree — the duplicate scanner is
gone (grep-verified: no `matchDocumentEntries`). The finder keeps its Mod+Shift+O
plane behavior and structural-tier availability. Full frontend gate green; the
finder state test (2) and prior suites pass.

## Notes

`DocumentSearchSurface.tsx` (in the step scope) needed no change: the controller's
return shape is preserved, so the surface consumes it unchanged. The finder now
also matches document TITLES (the shared matcher's field set is a superset of the
old stem/path/doc_type scan) — a strict improvement, not a behavior regression.
