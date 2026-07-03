---
tags:
  - '#exec'
  - '#search-providers'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S08'
related:
  - "[[2026-07-03-search-providers-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace search-providers with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S08 and 2026-07-03-search-providers-plan placeholders are machine-filled by
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
     The Register the three providers: semantic wrapping the existing per-corpus /search pair unchanged, files-vault matching the complete cached vault tree including titles, files-code matching the walked code-files listing, each with its own honest empty and degraded semantics and ## Scope

- `frontend/src/stores/server/searchProviders.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Register the three providers: semantic wrapping the existing per-corpus /search pair unchanged, files-vault matching the complete cached vault tree including titles, files-code matching the walked code-files listing, each with its own honest empty and degraded semantics

## Scope

- `frontend/src/stores/server/searchProviders.ts`

## Description

- Add `useSemanticProvider`: wraps `useUnifiedSearchController` (the existing
  per-corpus `/search` pair, wire unchanged), maps its live hits to
  `semantic`-band entries, and reports `degraded` (tiers-gated) when rag is
  offline — contributing nothing so the files providers keep serving.
- Add `useFilesVaultProvider`: a literal match over the COMPLETE cached vault
  tree via the shared `rankLiteralMatches`, over stem / path / title / feature
  tags, building `doc:{stem}` results; always available on the structural tier,
  `degraded` only when that tier is down.
- Add `useFilesCodeProvider`: a literal match over the walked `useCodeFiles`
  listing, over basename / path / title, building `code:{path}` results; an
  empty corpus is an honest empty result, never a degraded lie.
- Plumb the engine-served vault-tree `title` through: add `title?` to
  `VaultTreeEntry` and populate it in `adaptVaultTreeEntry`, so files-vault can
  match documents by their H1 title (the ADR's "including titles").

## Outcome

The three providers are registered behind the S07 contract, each with honest
empty/degraded semantics. Full frontend gate green (`just dev lint frontend`,
0 errors). The vault-tree title plumbing is regression-free: the `adaptVaultTree`,
document-search, and search-controller suites pass (152 tests) — the exact-shape
adapter vector carries no wire title so it is unaffected, and the live-tree
assertions read specific fields, not whole-entry equality.

## Notes

Scope expanded beyond `searchProviders.ts` to `engine.ts` + `liveAdapters.ts` for
the `title` plumbing: the engine already serves `title` on every vault-tree row
(`build_vault_tree_rows`), but the frontend adapter dropped it, so "match titles"
required threading the field onto `VaultTreeEntry`. Minimal and required by the
ADR, not scope creep. Transitional note: until S09 folds the rag-down fallback out
of the semantic path, the semantic provider still carries the vault text fallback
when offline (duplicating files-vault); the host is not wired to any surface yet,
so nothing user-facing double-lists in the interim — S09 retires that path.
