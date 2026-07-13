---
tags:
  - '#exec'
  - '#document-editor-redesign'
date: '2026-07-11'
modified: '2026-07-12'
step_id: 'S01'
related:
  - "[[2026-07-11-document-editor-redesign-plan]]"
---

# Add a bounded stores selector exposing the pickable corpus and existing feature-tag set, derived in useMemo from the raw useVaultTree slice

## Scope

- `frontend/src/stores/server/queries.ts`

## Description

- Add `EditorCorpusDocument` / `EditorLinkingCorpus` shapes and the pure
  `deriveEditorLinkingCorpus` projection over the served vault-tree entries: per
  document a stem, H1 title (falling back to the stem), and first feature tag; plus
  the sorted distinct feature-tag vocabulary.
- Add the `useEditorLinkingCorpus` stores selector deriving that corpus in a
  `useMemo` over the raw `useVaultTree` entries slice (store-selector law).
- Unit-test the derivation (stems/titles/feature, sorted vocabulary, empty case).

## Outcome

Delivered. The editor reads its link corpus through one stores selector; no new
wire fetch (the vault tree is already served). Grounded rag-first on the
`/vault-tree` shape and the existing `filterVaultTreeEntries` matcher. Typecheck,
eslint, prettier, and the unit test pass.

## Notes

Index documents are already excluded from `/vault-tree` rows upstream, so they
never surface as link targets — no client filter needed.
