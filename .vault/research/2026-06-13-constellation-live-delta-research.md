---
tags:
  - '#research'
  - '#constellation-live-delta'
date: '2026-06-13'
modified: '2026-06-13'
related:
  - "[[2026-06-12-dashboard-foundation-reference]]"
  - "[[2026-06-13-dashboard-live-state-adr]]"
  - "[[2026-06-13-frontend-state-system-reference]]"
---

# `constellation-live-delta` research: `engine-to-TanStack constellation live-delta seam`

Investigation of whether the engine graph API to TanStack (`frontend/src/stores/`)
cross-wiring is clear, well-scoped, and complete across the three data-source
domains (git worktree, git commit, vaultspec-core), and whether the remaining
work needs design/ADR effort. Triggered by a readiness review after the engine
hardening campaign. Grounds the `constellation-live-delta` ADR.

## Findings

### F1 — the seam is well-scoped and delivered, with one exception

The wire client is `stores/server/` (the SOLE wire client per `dashboard-layer-ownership`),
under a three-tier discipline (server -> TanStack Query; view -> Zustand;
per-frame -> scene via `SceneController`), keyed by the contract's
`(scope, filter, as_of, granularity)` cacheability unit. Every contract
capability family maps to a type + a query hook + a cache key, all delivered and
green, recorded in the frontend-state-system reference. The three data-source
domains are each covered:

- **git worktree** -> `/map`, `/vault-tree` (section 3), the `git` stream channel,
  the `/status` git block -> `useWorkspaceMap`, `useVaultTree`, `useEngineStream`,
  the `liveStatus` slice.
- **git commit** -> `/events` (section 5), `/graph/diff` + the `graph` stream on the
  single delta clock (section 5/7), `/status` -> `useEngineEvents`, `graphSync`,
  `TimeTravelDriver`.
- **vaultspec-core** -> `/ops/core/*` (section 6), the vault graph `/graph/query`
  + `/nodes/*` (section 4), the `fs` stream -> `dispatchOps`, `useGraphSlice`,
  the node-detail/neighbors/evidence hooks.

The boundaries are one-way and ADR-backed (foundation, gui, platform, live-state
ADRs). Conclusion: the seam does NOT need broad architecture work — it is clear
and well-scoped.

### F2 — the single open architectural gap: live constellation deltas (S50)

The one capability the seam cannot yet deliver is the no-refetch LIVE animation
of the feature constellation. Confirmed at the code level:

- `POST /graph/query` at `granularity=feature` returns `nodes/edges/meta_edges/
  filter/as_of` with **no `seq`** — the constellation keyframe has no anchor on
  the delta clock.
- The single commit path (`commit_graph`) diffs the full document `LinkageGraph`
  and broadcasts those entries on the `graph` channel; the feature meta-edges are
  memoized (`meta_edges()`) but **never diffed or streamed** — the delta clock is
  document-granularity only.
- Contract section 4 forbids the GUI from flattening document edges client-side to
  derive the constellation, so the client cannot synthesize the missing feature
  deltas (it would also drift from the engine's stable meta-edge ids).

The frontend is built to this boundary and stops honestly: the delta clock
(`deltaLog`), `TimeTravelDriver.spliceLive`, and a graph-sync hook doing targeted
cache invalidation (the contract's buildable liveness half) all exist; the
no-refetch delta-apply is flagged engine-blocked per `engine-read-and-infer`. The
prior asof-granularity fix gave the HISTORICAL keyframe its feature species; the
LIVE clock participation is unsolved.

### F3 — the real design question (why it needs an ADR, not a param)

Resolving S50 is not a flag flip: it forces a decision about how the feature
constellation participates in the single monotonic clock (REDLINE-3) over one SSE
connection (section 7). The sharp sub-question: if document and feature deltas
share one seq space, a feature-only consumer sees non-contiguous seqs and naive
per-granularity gap detection misfires. Options surveyed:

- **Engine projects the rebuild diff to a feature/meta-edge delta on the same
  clock, granularity-tagged; resume/gap-detection global-seq, application
  per-granularity (RECOMMENDED).** Keeps one clock + one connection; the keyframe
  carries `last_seq`; stable meta-edge ids make the diff deterministic; bounded
  cost (the constellation is small).
- **Client re-derives meta-edges from document deltas (REJECTED).** Violates
  section 4; re-creates engine-owned aggregation; id drift.
- **Keyframe `seq` only, keep cache invalidation (INSUFFICIENT / shipped floor).**
  Real and resilient, but refetches the whole constellation per change — not the
  contract's no-refetch clock model.
- **Per-granularity seq spaces or a second channel (REJECTED).** Forks the single
  clock and connection.

### F4 — adjacent items that are scoped, not architecture work

- Evidence excerpt/content preview: contract section 11 W1, a future engine rev.
- Evidence item-level field shapes (documents/code_locations/commits): a smaller
  flagged contract reconciliation, not a new architecture.
- `date-mandate` `/status` signal for the `dateMandateMissing` degradation row: a
  one-line adapter map once the engine names the signal.

## Conclusion

The engine-to-TanStack seam is clear, well-scoped, and delivered for all current
capabilities. The single architectural decision outstanding is the live
constellation delta clock (S50), which warrants an ADR and a contract amendment
(sections 4/5/7) plus a bounded engine capability — decided in the
`constellation-live-delta` ADR.
