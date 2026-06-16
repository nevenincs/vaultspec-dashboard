---
tags:
  - '#research'
  - '#backend-hotpath-hardening'
date: '2026-06-16'
modified: '2026-06-16'
related: []
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #research) and one feature tag.
     Replace backend-hotpath-hardening with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `backend-hotpath-hardening` research: `backend hot-path data-plane findings`

A discovery sweep over the backend data plane (`engine/crates/**` and
`frontend/src/stores/**`) for hot-path full-scans, unbounded accumulators, and
super-linear work, following the worktree-enumeration sweep. Each finding below
was verified by reading the cited code. Wave of the backend implementation
campaign.

## Findings

### F1 (HIGH, engine) — `find_vault_doc` walks the whole `.vault` tree per content fetch

`routes/content.rs` resolves a `doc:{stem}` node by calling `find_vault_doc`,
which DFS-walks the entire `.vault` tree, collects every basename match into a
`Vec`, sorts, and takes the first — on EVERY `GET /nodes/{id}/content`. On the
~7000-doc corpus a reviewer opening many documents pays a full tree walk each
time. The result is discarded; nothing is memoized. The resolver already builds a
`by_basename` inverted index during indexing (`ingest-struct/resolve.rs`), but it
is transient and not retained in the cell.

### F2 (HIGH, stores) — `staleTime: Infinity` with no `gcTime` on two queries

`useSettingsSchema` and the engine stream options both set `staleTime: Infinity`
with NO explicit `gcTime` (`stores/server/queries.ts`). This is the exact pattern
`bounded-by-default-for-every-accumulator` names as a defect: an unobserved entry
(and, for the stream, its retained 256-chunk array) lingers for the default 5
minutes with no declared bound.

### F3 (MEDIUM, stores) — O(N) dedup scan per stream chunk

`streamReducer` dedups by seq with `acc.some(...)` before appending — an O(N)
linear scan over the retained window (cap 256) on every chunk for the whole
session. A `Set<number>` of retained seqs makes the dedup O(1).

### Deferred to later campaign waves (verified, lower priority)

- F4 (MEDIUM, engine): `graph_query_inner` rebuilds `scope_nodes` with a full
  node scan per `/graph/query` (broken-link endpoint check); memoizable per
  generation like the sibling caches.
- F5 (MEDIUM, engine): `filter.rs` validation/`matches_edge` use repeated
  `.iter().any()` over small const arrays; pre-built sets would make them O(1).
- F6 (LOW, stores): the stream reducer `slice`s a new 256-array per chunk once
  full; a ring buffer avoids the per-chunk copy.
