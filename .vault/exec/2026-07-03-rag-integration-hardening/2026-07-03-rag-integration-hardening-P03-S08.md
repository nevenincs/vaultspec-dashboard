---
tags:
  - '#exec'
  - '#rag-integration-hardening'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S08'
related:
  - "[[2026-07-03-rag-integration-hardening-plan]]"
---

# Teach the tolerant search adapter the flat HTTP vocabulary (top-level results, snippet alongside excerpt and text, forwarded index_state and semantic_epoch) while keeping the node-id derivation grammar unchanged

## Scope

- `frontend/src/stores/server/liveAdapters.ts`

## Description

- Rewrote `adaptSearch` to read the flat annotated HTTP envelope: results are read from top-level `body.results` and adapted per hit. Deleted the nested `{envelope:{data:{results}}}` CLI-subprocess reading and the `Array.isArray(body.results)` mock short-circuit — the flat cutover leaves one shape, no bridge, per no-deprecation-bridges.
- Added `adaptSearchIndexState` to forward rag's `index_state` freshness block verbatim, normalizing each field tolerantly (source/status strings, non-negative integer counts, boolean `target_matches`, the two target roots) and returning undefined when no field survives.
- Added `normalizeSearchEpoch` preserving the three distinct served truths of `semantic_epoch`: a warm number, an explicit `null` (honest known-unknown), and `undefined` (not served — the degraded path emits none). `null` and `undefined` are not collapsed.
- Added `normalizeSearchCount` for the index_state counts.
- Emitted `index_state` and `semantic_epoch` onto `SearchResponse` only when present, so a degraded/empty search carries neither rather than a fabricated block.
- Added `SearchIndexState` and the `index_state` / `semantic_epoch` optional fields to the `SearchResponse` type in `engine.ts` (the type home for the search wire).
- Left the snippet/excerpt/text excerpt precedence and the `deriveSearchNodeId` node-id grammar unchanged (engine annotation wins; stem/path fallback preserved).

## Outcome

`adaptSearch` now produces the flat-shape adapted `SearchResponse` with freshness forwarded as served truth. `tsc -b` reports no errors in the touched files. The node-id derivation grammar is byte-identical.

## Notes

- The flat-shape adapter test vectors (top-level results, snippet, index_state pass-through, null vs absent epoch) are authored in S10; the old nested-envelope vectors in `liveAdapters.search.test.ts` are rewritten there. This step's per-step check is the type gate.
- Pre-existing, unrelated: `frontend/src/app/right/RagOpsConsole.tsx` carries stranded working-tree WIP (a Figma console rewrite) that passes `className` to the kit `Button`, which the kit does not accept — five `tsc` errors already present before this phase, in a file outside P03 scope and not touched here.
