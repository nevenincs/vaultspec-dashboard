---
tags:
  - '#adr'
  - '#graph-filter-fetch-split'
date: '2026-06-22'
modified: '2026-06-22'
related:
  - "[[2026-06-22-graph-filter-fetch-split-research]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #adr) and one feature tag.
     Replace graph-filter-fetch-split with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     Status convention: the H1 status value is one of proposed, accepted,
     rejected, or deprecated. A new ADR starts as proposed; it moves to
     accepted or rejected when the decision is made, and to deprecated
     when a later ADR supersedes it.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `graph-filter-fetch-split` adr: `Two-tier graph filter: backend bounds the payload, client narrows within it` | (**status:** `accepted`)

## Problem Statement

A performance directive: drive filtering on the BACKEND so the engine never serves
information the client will discard — but NEVER completely re-query all data just
because a filter changed. The rag-grounded audit (research `F1`–`F6`) found these two
goals are in tension per facet, and that the premise was partly inverted: the main
`/graph/query` slice is ALREADY backend-filtered (every rail facet via
`filter.rs::matches_node`, sent on the wire, re-queried on change), and both LODs are
already payload-bounded (feature-count at feature granularity, `MAX_DOCUMENT_NODES` =
5000 at document granularity). The real defects are that the slice query has NO
`placeholderData`, so every filter change BLANKS and re-fetches, and that a class of
facet toggles re-query for ZERO payload reduction (doc-level facets at the feature
constellation LOD, where they cannot reduce a feature node set).

## Considerations

- The tension is irreducible per facet (`F5`): backend-filtering a facet bounds the
  wire but forces a re-query; client-narrowing it avoids the re-query but serves the
  un-narrowed superset. The optimal answer is to classify EACH facet by which cost
  dominates AND by whether the client can even replicate it.
- DECISIVE GROUNDING (revised after reading `graph_query_inner`): the engine applies
  `matches_node` to the underlying DOCUMENT nodes BEFORE the granularity projection.
  At feature granularity the surviving documents are AGGREGATED into feature-
  convergence nodes, and only those convergence nodes (tag + member_count) are served
  — NOT their member documents. So a `doc_type`/`status`/`text` filter at feature LOD
  reshapes WHICH features appear and their member counts via member-document matching
  that the client cannot see. The client literally lacks the data to narrow these
  facets at feature granularity.
- `keepPreviousData` is already imported in the stores layer and is the in-repo
  optimal shape (the timeline lineage query holds its set and windows it client-side,
  refetching only on a bespoke signal).
- The engine already filters comprehensively; NO engine change is required.

## Constraints

Two correctness gates make the node/text facets un-client-narrowable at EVERY
granularity — so the originally-considered "move cheap facets to the client" split is
REJECTED:

- Feature-aggregation gate: at feature granularity the served nodes are aggregates of
  FILTERED member documents; the client has no member documents, so it cannot replicate
  a `doc_type`/`status`/`text` narrow. Applying it client-side would show stale
  feature nodes (wrong members, wrong counts, wrong presence).
- Ceiling gate: at document granularity the engine truncates to `MAX_DOCUMENT_NODES`
  BEFORE serialization, so a node-reducing facet applied only on the client narrows
  AFTER truncation and silently drops matches beyond the ceiling.

Therefore every node/edge/text-reducing facet MUST stay on the engine. The decision
depends only on already-shipped, stable surfaces (the engine filter, the client
membership for client-added nodes + the legend, TanStack caching). No frontier risk.

## Implementation

High-level, layered (the plan enumerates steps):

- D1 (ADOPTED) — Smooth, cache-first fetch. Give the graph-slice query (and its
  salience sibling delegate) `placeholderData: keepPreviousData` so a filter change
  shows the prior bounded slice while the new one loads, and a previously-seen filter
  is cache-instant. This is the real, safe optimization: it removes the blank and the
  "full re-query" feel without changing what the backend serves.
- D2 (REJECTED — correctness hazard) — A granularity-aware split that moved node/text
  facets to a client narrow was considered and rejected: the feature-aggregation gate
  and the ceiling gate (above) mean the client cannot replicate those facets, so they
  stay engine-side at all granularities. The `dashboardGraphFilter` builder is left
  sending the full set of node/edge facets to the engine; a documenting comment records
  WHY (so a future agent does not "optimize" it into the hazard), and a test pins the
  invariant.
- D3 (UNCHANGED) — The client membership keeps applying the full filter, but its real
  work is now correctly scoped to what it CAN narrow: client-added nodes (working-set
  ego expansions, pinned discoveries) and the legend category mask — not the rail
  facets, which the engine already removed.
- D4 (ADOPTED) — Neighbor ego expansions and the legend mask stay CLIENT-narrow. Keying
  the ego fetch on the full filter would re-query every opened node's ego on a global
  toggle, and a 1-hop ego is tiny (no ceiling, and the served ego docs carry the facet
  fields, so client-narrowing them IS correct, unlike the aggregated feature nodes).

## Rationale

The directive's two halves are reconciled WITHOUT moving filtering off the engine: the
backend already serves only the limited (LOD + facet) set — never "all data" — so
"don't serve un-consumed data" is met; and `keepPreviousData` + the bounded cache make
the unavoidable, bounded re-query smooth and instant-on-repeat, so "never completely
re-query all data" is met in spirit (a filter fetches the LIMITED set, not the
universe). The deeper client-narrow split is rejected on hard correctness grounds
(`F1` and the feature-aggregation reading of `graph_query_inner`), which is exactly the
"research, be careful, do not blanket code" the directive demanded.

## Consequences

- Gains: filtering never blanks; a previously-seen filter is instant; the engine filter
  stays the single, correct narrowing authority; no engine change, no risky client
  re-implementation of member-aggregation.
- Honest costs: this delivers LESS code than the directive's first framing implied,
  because the audit found the backend filtering already in place and load-bearing. A
  filter change still issues one bounded backend round-trip (the limited set), now
  smooth rather than blanking. Neighbor egos still serve a tiny unfiltered set that the
  client narrows — accepted as optimal (filtering them backend-side would re-query all
  egos).
- Pathway / pitfall: the feature-aggregation gate is the durable trap — any future
  attempt to "filter client-side to avoid a re-query" must respect that the client
  cannot replicate facets computed over unserved member documents.

## Codification candidates

- **Rule slug:** `node-facets-filter-on-the-engine`.
  **Rule:** Graph node/text/edge-reducing filter facets (doc_type, status, plan_tier,
  text, tiers, relations, structural_state, confidence, health) are applied on the
  ENGINE in the `/graph/query` filter, never re-derived as a client-side narrow of the
  served slice — because at feature granularity the served nodes aggregate FILTERED
  member documents the client never receives, and at document granularity the engine
  truncates to the node ceiling BEFORE serialization. The client membership narrows
  only what it can fully see: client-added nodes (ego expansions, pins) and the legend
  category mask.
