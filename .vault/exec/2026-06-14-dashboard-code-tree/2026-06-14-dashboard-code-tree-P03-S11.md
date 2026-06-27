---
tags:
  - '#exec'
  - '#dashboard-code-tree'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S11'
related:
  - "[[2026-06-14-dashboard-code-tree-plan]]"
---

# Join code-row selection bidirectionally to code: stage nodes mirroring the doc:<stem> join

## Scope

- `frontend/src/app/left/browserSelection.ts`

## Description

- Add the bidirectional `code:<path>` selection-join helpers beside the existing `doc:<stem>` join: `codePathToNodeId`, `nodeIdToCodePath`, `handleCodeEntryClick` (row click focuses the file's `code:` node via the shared selection), and `highlightedCodePathFor` / `useHighlightedCodePath` (the active stage selection resolves the matching visible row).
- Match the row on the entry's carried `node_id` (the shared-rule id) so the join is robust to path normalization.

## Outcome

- COMMITTED: `frontend/src/app/left/browserSelection.ts` — the file was clean at HEAD (no peer WIP), so the `code:`-join additions are committed alongside the new `CodeTree` files. The helpers live in the same module as the `doc:<stem>` join they mirror, keeping the shared selection-join home discoverable for the IA host.

## Notes

- The join exactly mirrors the vault browser's `doc:<stem>` realization (`pathToNodeId` / `nodeIdToStem` / `handleEntryClick` / `useHighlightedPath`), now for `code:<path>` — no new identity scheme, the same shared `node_id` derivation the listing already applied (`provenance-stable-keys-are-identity-bearing`).
- A file with no `code:` node still selects (the click focuses the id even when no node is mounted); the absence is conveyed visually by the quiet absent-interlink state (P03.S12), never by blocking navigation.
