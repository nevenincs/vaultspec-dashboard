---
tags:
  - '#exec'
  - '#document-editor-redesign'
date: '2026-07-11'
modified: '2026-07-11'
step_id: 'S01'
related:
  - "[[2026-07-11-document-editor-redesign-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace document-editor-redesign with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S01 and 2026-07-11-document-editor-redesign-plan placeholders are machine-filled by
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
     The Add a bounded stores selector exposing the pickable corpus and existing feature-tag set, derived in useMemo from the raw useVaultTree slice and ## Scope

- `frontend/src/stores/server/queries.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
