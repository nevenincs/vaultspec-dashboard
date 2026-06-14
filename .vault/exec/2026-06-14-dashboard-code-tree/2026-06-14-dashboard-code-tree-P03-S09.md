---
tags:
  - '#exec'
  - '#dashboard-code-tree'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S09'
related:
  - "[[2026-06-14-dashboard-code-tree-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-code-tree with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S09 and 2026-06-14-dashboard-code-tree-plan placeholders are machine-filled by
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
     The Add a stores query hook for /file-tree with lazy per-directory fetch and per-scope cache and ## Scope

- `frontend/src/stores/server/` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add a stores query hook for /file-tree with lazy per-directory fetch and per-scope cache

## Scope

- `frontend/src/stores/server/`

## Description

- Add the stores query hook `useFileTree(scope, path?, enabled?)` for `/file-tree` with lazy per-directory fetch and per-scope cache: the cache key folds `(scope, dir-path, cursor)` so each expanded directory — and each page of a paginated level — is its own cache entry, fetched on first expansion and cached per scope thereafter.
- Add the `engineKeys.fileTree(scope, path?, cursor?)` key and the `EngineClient.fileTree(...)` wire method.
- Add the `useFileTreeAvailability` stores selector deriving worktree-only degradation from the `structural` tier (the code mode reads degradation only through this selector, never the raw tiers block).
- Wire the wholesale workspace swap to drop the whole `file-tree` cache subtree so a prior project's levels never survive.

## Outcome

- Verified: the hook + selector typecheck clean and are exercised end-to-end by the `CodeTree` render tests against the mock transport.
- DEFERRED (entangled): `frontend/src/stores/server/queries.ts` (the `useFileTree` hook, key, `useFileTreeAvailability`, swap-cache-clear) and `frontend/src/stores/server/engine.ts` (the `fileTree` client method + wire types) both carry heavy uncommitted peer pipeline-status / workspace-registry edits.

## Notes

- Lazy per-directory fetch is realized by mounting a child level component only when its parent directory expands, so its `useFileTree(scope, path)` query fires on first expansion — the rail never requests the whole tree (the bounded-read discipline, `graph-queries-are-bounded-by-default`).
- DEFERRED COMMITS: both stores files are peer-entangled; the additions are kept in-tree and uncommitted. They are additive (new hook/key/method) and the full peer suite stays green.
