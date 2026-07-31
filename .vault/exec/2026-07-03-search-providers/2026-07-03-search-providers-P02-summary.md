---
tags:
  - '#exec'
  - '#search-providers'
date: '2026-07-03'
modified: '2026-07-03'
body_hash: 'sha256:7a97b1fb8dad2733f1f8d4d44b24c871917a83dc5be5bd81303b65462aae3caa'
related:
  - "[[2026-07-03-search-providers-plan]]"
---

# `search-providers` `P02` summary

## Description

Phase P02 landed the frontend readers and the shared literal matcher utility. The `codeFiles` cursor-walking client mirrors `vaultTree`, bounded at 25 pages (50k-file ceiling), carrying the generation-stable `truncated` block through to the tolerant `adaptCodeFiles` adapter. The adapter normalizes wire variation: blank paths drop rows, missing `node_id` reconstructs from `code:{path}`, unrecognized bodies fail closed to empty. The `useCodeFiles` query hook caches keyed on scope and walks to completion, so client narrowing holds the complete listing. Concurrently, the shared `literalMatch` utility exports one source of truth for name-based scoring with explicit rank bands: strong-literal (0.70–0.95) for exact or prefix matches over stem/path/title/tags, weak-literal (0.20–0.50) for substrings. The utility replaces two near-duplicate scanners and is exercised over 41 test vectors. A mid-execution concurrent-edit collision (duplicate `adaptCodeFiles` export in a shared worktree) was repaired by a follow-up commit (`8f9c8f3fe2`), verified residue-free.

### Files Modified / Created

- Modified: `frontend/src/stores/server/engine.ts` (added `CodeFileEntry`, `CodeFilesTruncation`, `CodeFilesResponse` types and `codeFiles` client method)
- Modified: `frontend/src/stores/server/liveAdapters.ts` (added `adaptCodeFiles`, `adaptCodeFileEntry`, `adaptCodeFilesTruncation`)
- Modified: `frontend/src/stores/server/queries.ts` (added `useCodeFiles` hook)
- Created: `frontend/src/stores/server/literalMatch.ts` (shared literal matcher utility)
