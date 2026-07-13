---
tags:
  - '#adr'
  - '#backend-hotpath-hardening'
date: '2026-07-13'
modified: '2026-07-13'
related:
  - "[[2026-06-16-backend-hotpath-hardening-research]]"
  - "[[2026-06-16-backend-hotpath-hardening-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #adr) and one feature tag.
     Replace backend-hotpath-hardening with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     Status convention: the H1 status value is one of proposed, accepted,
     rejected, superseded, or deprecated. A new ADR starts as proposed; it
     moves to accepted or rejected when the decision is made; it becomes
     superseded when a later ADR replaces it (set by vault adr supersede,
     which also records superseded_by); and deprecated when it is retired
     without a direct successor.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `backend-hotpath-hardening` adr: `generation-keyed basename index and bounded query caches` | (**status:** `accepted`)

## Problem Statement

RETROACTIVE RECORD: this decision was executed directly against the grounding research on
2026-06-16 without an ADR checkpoint at the time; this document records it after the fact
rather than leaving the executed plan ungrounded.

The content route resolved a served node id to its `.vault/` document path by walking the
whole vault tree on every request. The walk is proportional to corpus size and repeats
identical work across requests that share a graph generation, making it an avoidable
per-request cost on a hotpath. Separately, two frontend TanStack queries were configured
with `staleTime: Infinity` and no `gcTime`, an unbounded accumulator in violation of the
project's resource-bounds rule, and a per-chunk stream dedup used an O(N) scan instead of
an O(1) set lookup.

## Considerations

The engine already caches other per-generation projections (`doc_views_cache`) on the
`ScopeCell`; a basename index is the same shape of cache and should mirror its invalidation
lifecycle (rebuilt on generation bump, reused within a generation). The frontend caches
needed a bound without abandoning the "these change rarely" premise that justified the
infinite `staleTime` in the first place.

## Considered options

- **Per-request tree walk (status quo)** — simplest, but O(corpus size) per request with no
  memoization; rejected as the identified hotpath cost.
- **Generation-keyed basename index cache on `ScopeCell`** — one walk per generation, O(1)
  lookups thereafter, consistent with the existing `doc_views_cache` pattern. Chosen.
- **Leave `staleTime: Infinity` with no `gcTime`** — unbounded cache growth, rejected per the
  project's resource-bounds rule.
- **Add explicit `gcTime` alongside `staleTime: Infinity`** — keeps the "rarely changes"
  freshness contract while bounding retention. Chosen.

## Constraints

None beyond mirroring an already-proven pattern (`doc_views_cache`); no new dependency, no
frontier technology.

## Implementation

Add a generation-keyed doc-basename index field and accessor on `ScopeCell`, built once per
graph generation the same way `doc_views_cache` is; have `resolve_node_path` consult the
index instead of re-walking the tree, preserving the existing sorted-first tie-break for
duplicate basenames. On the frontend, add explicit `gcTime` to `useSettingsSchema` and the
engine stream options so the caches are bounded even though they stay long-`staleTime`.

## Rationale

Grounded in the `backend-hotpath-hardening` research's identification of the per-request
tree walk and the unbounded frontend caches as the two live hotpath/resource-bound
violations; the generation-keyed cache shape was chosen because it reuses an existing,
already-reviewed invalidation pattern rather than inventing a new one.

## Consequences

Removes an O(corpus) cost from a hotpath at the price of one extra cache field to keep
consistent with `doc_views_cache`'s invalidation. The frontend caches are now bounded
without losing their long-freshness intent. No known pitfalls; the parity test (index vs.
tree-walk resolution, including the tie-break) guards against silent behavior drift.
