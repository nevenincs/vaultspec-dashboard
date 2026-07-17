---
tags:
  - '#adr'
  - '#graph-slice-delta'
date: '2026-07-13'
modified: '2026-07-17'
related:
  - '[[2026-07-12-vault-tree-delta-adr]]'
---

# `graph-slice-delta` adr: `generation-keyed graph-slice delta + refetch storm floor` | (**status:** `accepted`)

## Problem Statement

Live wire capture (2026-07-13, idle desktop against the dev engine) caught `/graph/query` re-fetching the full bounded document slice (~3.5 MB decoded / ~420 KB gzip) every ~6 seconds, continuously, with no user interaction — ~35 MB decoded per idle minute. The trigger chain is correct but amplifying: the watcher rebuild emits document-granularity deltas on the graph SSE channel; the live-sync hook treats ANY document delta as "cannot splice" and fires the debounced generation sweep; the sweep refetches every active graph observer in full. The 150 ms debounce collapses one burst, but a corpus under active editing (in the captured case a sibling workspace edited every few seconds by agent sessions) produces one burst per edit — change-proportional input, constant-full-cost output. Feature-granularity deltas already splice with zero refetch; the document slice has no equivalent, so the largest payload in the product is also the most re-fetched.

## Considerations

- The engine already memoizes the enriched per-generation projections, and the served bounded slice is DETERMINISTIC per (query params, generation): same filter/granularity/lens/focus/corpus at the same generation always serves identical bytes. That makes a snapshot-and-diff scheme exact, mirroring the shipped listing delta (vault-tree-delta ADR).
- The scene is already built for warm same-scope updates: every ambient warm data path pins carried survivors before relaxing (`prewarmReflow`), and a same-id-set update ticks zero — a spliced slice needs NO scene contract change; the patched cache value flows through the existing set-data path.
- Bounded-slice honesty: the document slice is served under the node ceiling with self-consistent edges and a `truncated` block. Ceiling MEMBERSHIP can change between generations; a delta must express that as adds/removes over the served slice, never leak a node the full route would not have served.
- The client's only live signal is stream-chunk processing; whatever replaces the blind sweep must keep the resilient floor (gap → re-keyframe → full refetch).
- Storms must be bounded even when deltas are unavailable (`full_required`, cold ring): a refetch floor is defense in depth, not a substitute for the delta.

## Considered options

- **Longer debounce alone** — collapses bursts but a steady edit tempo still refetches full slices at the debounce rate; pure dampening trades staleness for cost with no asymptotic win. Kept only as the D1 floor, rejected as the primary fix.
- **Client-side splice from the SSE document deltas** — the deltas exist on the wire, but they describe the WHOLE corpus graph, not the served bounded slice; the client cannot compute ceiling membership (DOI bound) locally, so splicing them risks a slice the engine would never serve. Rejected.
- **ETag/304 on `/graph/query`** — a vault edit almost always changes the slice bytes, so 304 hit-rate is near zero. Rejected.
- **Generation-keyed slice delta (CHOSEN)** — the engine snapshots the exact served slice per (params fingerprint, generation) in a bounded ring and serves an id-keyed diff; the client patches its cached slice atomically with the same guarded-reconcile pattern the listings use, full refetch as the universal fallback.

## Constraints

- Generations are per-scope and process-local (vault-tree-delta ADR constraint): the ring starts empty on restart and an unknown `since` MUST answer `full_required`.
- The ring is keyed by the FULL query-params identity (scope, filter, granularity, lens, focus, corpus, bounds) — a delta may only ever be served against a snapshot of the SAME params; params not in the ring answer `full_required`.
- Ring bounds are explicit at creation (resource-bounds): few param combos are live at once (the stage holds one document + one constellation query), so a small two-level cap (params-combos × generations) suffices; snapshots `Arc`-share the served slice.
- A `truncated`-block difference between snapshot and current is served as `full_required` (conservative: truncation composition is not diffable honestly).
- Time-travel (`asOf`) reads are historical snapshots — they never delta (immutable per sha; the existing cache already handles them).

## Implementation

- **D1 — refetch storm floor.** The live-sync document-delta path keeps its trailing debounce but gains a per-scope cooldown: under sustained churn, full-sweep invalidations are spaced at least `GRAPH_REFETCH_COOLDOWN_MS` apart (with a trailing edge so the final state always lands). Applies to the fallback path only; the D4 delta path is exempt (it is cheap by construction).
- **D2 — slice snapshot ring.** The engine retains, per scope cell, a bounded ring of served document-slice snapshots keyed by (params fingerprint, generation) — capped at a small params-combo count with a per-combo generation depth, oldest evicted, entries `Arc`-sharing the served slice value. Recorded at serve time by the full `/graph/query` handler (which also carries its serving `generation` in the response).
- **D3 — delta route.** `POST /graph/query/delta` with the SAME body as `/graph/query` plus `since`: diffs the ring snapshot at (params, since) against the current served slice by node/edge id — `{since, generation, changed_nodes, removed_node_ids, changed_edges, removed_edge_ids, truncated}` — or `{generation, full_required: true}` when the params/generation pair is not retained or truncation differs. Standard envelope + tiers; read-only.
- **D4 — client splice.** The live-sync document-delta path first attempts the delta against the held slice's generation and patches the cached slice value in one atomic, identity-guarded write (the shared guarded-reconcile pattern from the listing deltas); the scene consumes the patched slice through the existing set-data path (`prewarmReflow` pins survivors; a same-id-set update ticks zero). Any degradation (`full_required`, error, missing baseline, oversized delta) falls back to the D1-floored full sweep. The gap/re-keyframe resilient floor is unchanged.

## Rationale

The slice's determinism per (params, generation) makes the diff exact and the machinery a direct reuse of the proven listing-delta recipe — ring, honest `full_required`, guarded client patch, full refetch as fallback. The scene's pin-authoritative warm-update design means the patch integrates with zero contract change. The idle cost of watching an actively-edited corpus drops from full-slice-per-edit to bytes-proportional-to-change, and the D1 floor guarantees a worst-case ceiling even when every delta degrades.

## Consequences

- Watching a corpus under active editing stops costing ~35 MB decoded per minute; the recurring cost becomes proportional to actual change, with a floored worst case.
- New wire surface (slice `generation`, delta route) is additive; clients ignoring it keep today's semantics.
- The params-keyed ring is a more complex accumulator than the listing rings (two-level key); its bounds and eviction need dedicated tests.
- The same capture surfaced a separate storm-class item OUT OF SCOPE here: the authoring events stream reconnected ~18× in 25 s in one run — to be measured and, if real, fixed as its own follow-on (connection backoff / keep-alive).
