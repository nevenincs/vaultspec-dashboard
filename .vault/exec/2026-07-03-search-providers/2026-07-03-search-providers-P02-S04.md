---
tags:
  - '#exec'
  - '#search-providers'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S04'
related:
  - "[[2026-07-03-search-providers-plan]]"
---

# Add the codeFiles cursor-walking client (bounded page loop mirroring vaultTree), the tolerant adaptCodeFiles adapter, and the typed CodeFileEntry wire shape

## Scope

- `frontend/src/stores/server/engine.ts + liveAdapters.ts`

## Description

- Add the `CodeFileEntry`, `CodeFilesTruncation`, and `CodeFilesResponse` wire
  types in `engine.ts` beside the vault-tree types, plus the
  `CODE_FILES_PAGE_SIZE` (2000) / `CODE_FILES_MAX_PAGES` (25) walk bounds.
- Add the `codeFiles` client method mirroring `vaultTree`: a bounded page loop
  that walks the cursor to completion, accumulating entries and carrying the
  generation-stable `truncated` block through to the adapter.
- Add the tolerant `adaptCodeFiles` adapter in `liveAdapters.ts` with its
  `adaptCodeFileEntry` / `adaptCodeFilesTruncation` helpers over the shared
  `normalizeVaultTreeString`: a blank path drops the row; a missing `node_id`
  reconstructs from `code:{path}`; `returned_files` floors and clamps to 0; a
  missing `reason` or non-finite count collapses `truncated` to null; an
  unrecognized body fails closed to an honest empty listing.

## Outcome

The files(code) provider's data source landed: a complete client-held code-file
listing walked to completion over the real wire, tolerant to shape variation. Full
frontend gate green (`just dev lint frontend`) at commit time.

## Notes

Provenance correction (per team-lead directive; git history is authoritative):
`CodeFileEntry`/`CodeFilesTruncation`/`CodeFilesResponse` and `adaptCodeFiles`
were FIRST introduced by THIS step's commit `71aa225473` — `git log -S` confirms
it, and `aeed6a7ab3` (the code-graph feature) introduced neither. An earlier
revision of this record wrongly stated the types were pre-committed by
`aeed6a7ab3`; that arose from a concurrent second agent independently
re-implementing the same adapter in the shared working tree, which also produced
a transient duplicate `adaptCodeFiles` export in `71aa225473` (my pathspec `git
add` swept in the concurrent uncommitted block). The follow-up commit
`8f9c8f3fe2` removed the duplicate — keeping THIS step's `adaptCodeFileEntry`
implementation — and added the `adaptCodeFiles` unit vectors in
`liveAdapters.test.ts` (four cases: entry normalization + node-id fallback,
optional-field omission, truncation floor/clamp forwarding, and safe empty
defaults). HEAD now carries exactly one `adaptCodeFiles`, tsc clean.
