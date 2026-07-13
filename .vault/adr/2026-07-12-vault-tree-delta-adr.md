---
tags:
  - '#adr'
  - '#vault-tree-delta'
date: '2026-07-12'
modified: '2026-07-13'
related:
  - '[[2026-07-11-universal-data-loading-adr]]'
  - '[[2026-07-12-on-demand-cold-start-adr]]'
---

# `vault-tree-delta` adr: `generation-keyed vault-tree delta reconciliation` | (**status:** `accepted`)

## Problem Statement

The wire benchmark (2026-07-12 perf pass, commit `1aba7d99e7`'s campaign) showed `/vault-tree` is the largest recurring payload on both shells: ~765 KB decoded (~106 KB gzip) for the complete stem-sorted listing, walked to completion because the rail narrows client-side (the complete-set law). The cold-load cost is inherent and already progressive (small first page, paced drain, drain-progress). The recurring cost is not: every graph-generation invalidation — a vault save, a watcher rebuild, a git SSE frame — re-drains the WHOLE listing even when one document changed, and one benchmark window caught the full drain firing four times. On a phone this is the dominant repeat cost of an edit-heavy session.

## Considerations

- The engine already memoizes the full row projection per graph `generation` (`ScopeCell.vault_tree_rows`, invalidated on the generation bump), so consecutive generations' row sets are cheap to retain and diff — the delta source of truth already exists server-side.
- The complete-set law binds narrows to a COMPLETE listing; any incremental scheme must keep the held listing provably complete, or fall back to the full drain.
- Resource bounds: any retained snapshot ring must carry an explicit cap; `Arc`-sharing the already-memoized row vectors makes retention nearly free (only superseded generations hold extra memory).
- Wire contract: responses keep the `tiers` envelope; new fields are additive and absorbed by the tolerant adapters; degradation must be honest (an unknown baseline yields a full-drain instruction, never a wrong patch).
- `setQueryData` partials have known gotchas (universal-data-loading campaign): the reconcile must write a complete, internally consistent value.

## Considered options

- **HTTP caching (ETag/304) per page** — zero protocol change, but saves only network, not the client-side re-parse of ~765 KB per sweep, and the multi-page cursor walk still runs. Rejected as insufficient.
- **Field trimming the row shape** — every served field is consumed by the rail (signals, freshness, filters); trimming buys ~10% once. Rejected as marginal.
- **SSE-pushed row patches** — pushes deltas without a request, but invents a second delta clock beside the existing generation/invalidation seam and complicates recovery. Rejected for now; the pull model reuses the existing SSE-triggered sweep as its trigger.
- **Generation-keyed pull delta (CHOSEN)** — a `since=<generation>` delta route diffing retained row snapshots; the client patches its held listing and falls back to the full drain whenever the baseline is unknown. Minimal new machinery, exact reuse of the existing generation memo.

## Constraints

- The generation counter is per-`ScopeCell` and process-local: an engine restart resets it, so `since` from a previous process MUST be unanswerable — the ring starts empty and the route replies full-drain-required. Generations must never be persisted or compared across processes.
- A cursor walk can straddle a generation bump; the full-drain client must record the generation per page and restart the drain on a mid-walk mismatch (this also makes the pre-existing straddle explicit instead of silent).
- A partial (`complete: false`) held listing has no delta baseline; only a finished drain may be patched.

## Implementation

- **D1 — generation on the full route.** `/vault-tree` pages additionally carry the serving `generation`. The client drain records it; a mid-drain generation change restarts the walk (bounded by the existing page cap).
- **D2 — bounded snapshot ring.** The per-scope rows cache retains a small capped ring (8 entries) of `(generation, Arc<rows>)`, evicting oldest; entries `Arc`-share the memo's vectors. Lives in a new engine module extracted from `app.rs` together with the existing `vault_tree_rows` memo (the module-size gate forbids growing `app.rs`).
- **D3 — delta route.** `GET /vault-tree/delta?scope=&since=<generation>` diffs the ring snapshot at `since` against the current rows by stem: `{since, generation, changed: [full rows], removed: [stems]}` under the standard envelope. An absent `since` (evicted, restarted, never seen) or `since == current` short-circuits to `{generation, full_required: true}` / an empty delta respectively. The diff is O(N) per request over in-memory rows; the route stays read-only.
- **D4 — client reconcile.** The generation-invalidation sweep routes `vault-tree` through a reconcile seam instead of a blind invalidate: with a held COMPLETE listing and known generation it fetches the delta and patches the cached value (sorted stem-merge: replace changed, insert added, drop removed) via one atomic `setQueryData` carrying `complete: true` and the new generation; on `full_required`, error, partial baseline, or a delta touching more than half the set, it falls back to the existing full drain. The reconcile is stores-layer only; no chrome changes.
- `/code-files` is a candidate for the same pattern later; this ADR ships the vault tree only.

## Rationale

The engine's per-generation memo means the delta's entire server-side cost is retaining `Arc`s it already built and one bounded diff per request. The client's complete-set obligation is preserved because a patch is only ever applied on top of a complete baseline at a known generation, with the full drain as the universal honest fallback. The typical edit session's recurring 765 KB re-parse becomes a sub-kilobyte patch.

## Consequences

- An edit/watch session's repeat vault-tree cost drops from the full listing per sweep to rows-actually-changed; mobile benefits most (parse + memory, not just wire).
- New wire surface (`generation` field, delta route) is additive and versioned by behavior: clients that ignore it keep full-drain semantics.
- The ring is one more bounded accumulator to reason about; eviction correctness is unit-tested (miss → full_required, hit → exact patch).
- A future `/code-files` delta reuses D2–D4 verbatim; a future SSE-pushed patch could reuse the same reconcile seam.

- Live-verified 2026-07-13: same-generation delta 355 bytes; unknown-since degrades to full_required.
