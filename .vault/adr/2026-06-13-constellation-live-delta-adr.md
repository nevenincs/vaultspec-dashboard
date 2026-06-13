---
tags:
  - '#adr'
  - '#constellation-live-delta'
date: '2026-06-13'
modified: '2026-06-13'
related:
  - "[[2026-06-12-dashboard-foundation-reference]]"
  - "[[2026-06-13-dashboard-live-state-adr]]"
  - "[[2026-06-12-vaultspec-engine-adr]]"
  - "[[2026-06-13-frontend-state-system-reference]]"
---

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - If you must name a source file, class, or function, use inline backtick
       code: `src/module.py`. -->

# `constellation-live-delta` adr: `constellation participation in the single delta clock (S50)` | (**status:** `proposed`)

## Problem Statement

The engine-to-TanStack seam is well-scoped and delivered for every contract
capability EXCEPT one: the live feature **constellation cannot animate from the
stream without refetching**. The contract commits a single monotonic delta
clock shared by `/graph/diff` and the `graph` SSE channel (REDLINE-3): a client
holds a keyframe at a `seq` and applies ordered deltas onto the held model with
seq-dedup, no refetch. That path works for the **document** graph but not for
the **constellation** (feature granularity), because:

- the live constellation keyframe (`POST /graph/query`, `granularity=feature`)
  carries **no `seq`** — the consumer has no clock anchor to splice from;
- the delta clock is **document-granularity only** — `commit_graph` diffs the
  full `LinkageGraph` (document nodes + edges) and broadcasts those entries on
  the `graph` channel; the feature meta-edges are memoized (`meta_edges()`) but
  never diffed or streamed, so there is no feature-granularity delta to apply;
- contract section 4 forbids the GUI from flattening document edges client-side
  to derive the constellation — aggregation is the engine's job — so the client
  cannot synthesize the missing feature deltas itself.

This is the S50 divergence flagged in the live-state ADR and the
frontend-state-system reference. The frontend is built up to the boundary: the
delta clock (`deltaLog`), `TimeTravelDriver.spliceLive`, and a graph-sync hook
that does **targeted cache invalidation only** (the contract's stated buildable
liveness half) all exist and stop honestly at the seam per
`engine-read-and-infer`. The no-refetch animation is the half the engine must
unblock. The prior asof-granularity fix gave the *historical* keyframe its
feature species; this ADR decides the **live clock** participation.

## Considerations

- **Already shipped (build on, do not rebuild):** the single seq clock and
  `since=`-resumable `graph` channel; the GUI's `deltaLog` (idempotent splice,
  gap detection), `spliceLive`, and the live-connection slice staging `lastSeq`;
  the memoized per-generation meta-edge projection (`meta_edges()`).
- **Contract invariants that bind the design:** one delta clock (REDLINE-3);
  one multiplexed SSE connection (section 7); stable edge ids = content hash of
  (src, dst, relation, tier, provenance key) (section 2 / `provenance-stable-keys`),
  so a meta-edge diff is well-defined and re-derives identically; the GUI never
  flattens doc edges (section 4).
- **The seq-contiguity question (the real design choice):** if document and
  feature deltas share one seq space, a feature-only consumer sees
  non-contiguous seqs (document deltas consume seq values it never receives),
  so naive per-granularity gap detection misfires. The clock must stay single
  while letting each consumer resume correctly.

## Constraints

- **Read-and-infer (engine boundary).** The projection is inference over the
  graph the engine already owns; it writes nothing and adds no sibling
  semantics. The feature delta is derived, never authored.
- **Bounded cost.** The constellation is small (tens of feature nodes, tens to
  low-hundreds of meta-edges). One extra old-to-new meta-edge diff per rebuild
  is cheap next to the document diff already computed in `commit_graph`.
- **No new connection / no second clock.** Section 7 commits one SSE connection;
  REDLINE-3 commits one clock. The design must not fork either.

## Implementation

A high-level shape (not a plan):

- **D1 — every live graph keyframe carries the clock anchor.** `POST /graph/query`
  (both granularities, live path) returns `last_seq`: the delta clock's tip at
  query time. The constellation consumer splices live deltas strictly after it,
  exactly as the document/time-travel path already does.
- **D2 — the engine projects the rebuild diff to feature granularity on the
  same clock.** In the single commit path (`commit_graph`), after the existing
  document-level `diff(old, new)`, also diff the old-to-new **meta-edge and
  feature-node projections** and emit those entries on the `graph` channel.
  Every delta entry gains a `granularity` discriminator (`document` | `feature`)
  alongside its `op`/`node`/`edge`/`t`/`seq`. Both granularities advance the
  one monotonic seq; stable meta-edge ids make add/remove/change deterministic.
- **D3 — resume and gap-detection are GLOBAL, application is per-granularity.**
  `since=<seq>` replays ALL entries after `seq` regardless of granularity; the
  client tracks the single global `last_seq` for resume and gap detection (a
  gap is a hole in the GLOBAL seq, never a granularity it isn't watching), and
  APPLIES only the entries whose `granularity` matches its current view. This
  keeps one clock and one connection while making a feature-only consumer
  correct.
- **D4 — `/graph/diff` and `/graph/asof` honor `granularity=feature`.** asof
  already does (returns the feature keyframe). diff returns the projected
  feature delta log on the same clock, so a scrub re-keyframes and replays in
  the constellation's own species.
- **Consumer (unblocks the flagged frontend step):** the graph-sync hook reads
  the keyframe `last_seq`, subscribes `graph` with it staged, and swaps
  invalidation for `spliceLive` of the `granularity=feature` deltas onto the
  held constellation — no refetch.

## Rationale

The document graph already proves the keyframe-plus-clock model; the only
missing pieces are an anchor on the feature keyframe and a feature projection on
the same clock — both derivations the engine is positioned to do and the client
is forbidden to. Alternatives weighed:

- **Client re-derives meta-edges from document deltas — REJECTED.** Violates
  contract section 4 (the GUI never flattens doc edges); re-creates the
  aggregation the engine owns and would drift from the engine's own meta-edge
  ids.
- **Keyframe `seq` only, keep cache invalidation — INSUFFICIENT (the shipped
  fallback).** The live-state ADR's D3 invalidation path is real and stays as
  the resilient floor, but it refetches the whole constellation on every wire
  change; it is not the no-refetch animation the contract's clock model
  promises.
- **Per-granularity seq spaces / a second channel — REJECTED.** Forks the
  single clock (REDLINE-3) and the single connection (section 7). The
  global-seq-with-granularity-tag design (D3) preserves both.

Grounded in the wire contract (sections 2/4/5/7, REDLINE-3), the live-state ADR
(which flagged S50 and shipped the invalidation half), the engine ADR (the
single commit path and clock), and the frontend-state-system reference (the
consumer staged to the boundary).

## Consequences

- **Gains:** the live constellation animates without refetching, in its own
  species, on the one clock — the headline graphing-API liveness capability.
  Unblocks the frontend's flagged step verbatim (thread `lastSeq`, swap
  invalidation for `spliceLive`). Time-travel and live use one keyframe+delta
  model across both granularities.
- **Costs / amendments:** a contract amendment to section 4 (keyframe `last_seq`),
  section 5 (diff granularity), and section 7 (granularity-tagged `graph`
  deltas) — recorded as a contract event, reviewed by both seam owners. One
  extra meta-edge projection+diff per rebuild (bounded).
- **Pitfalls:** the global-seq/per-granularity-application rule must be explicit
  in the contract and the consumer, or a feature-only client mis-detects gaps;
  the meta-edge diff must reuse the same stable-id derivation as the query path,
  or live ids diverge from keyframe ids (guarded by `provenance-stable-keys`).

## Codification candidates

- Potential rule (after one execution cycle, per `vaultspec-codify`): "delta
  entries on the single clock are granularity-tagged; resume and gap-detection
  are global-seq, application is per-granularity." Durable if it holds through
  implementation; not codified on first encounter.
