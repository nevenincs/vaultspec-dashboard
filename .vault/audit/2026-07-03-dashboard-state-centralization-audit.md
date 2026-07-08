---
tags:
  - '#audit'
  - '#dashboard-state-centralization'
date: '2026-07-03'
modified: '2026-07-03'
related:
  - "[[2026-06-17-dashboard-state-centralization-audit]]"
  - "[[2026-07-03-global-state-review-adr]]"
---

# `dashboard-state-centralization` audit: `TanStack Query implementation quality`

## Scope

User-directed continuation of the codebase review campaign (2026-07-03,
reviewer-driven, no subagents): how well is the TanStack Query layer implemented?
Read in full or in targeted depth: `frontend/src/stores/server/queryClient.ts`,
the `engineKeys` factory and query configurations in
`frontend/src/stores/server/queries.ts` (bounded caches, stream options, manual-retry
surface, graph slice), `frontend/src/stores/server/dashboardState.ts` (mutation
machinery, cache convergence, write serialization), `frontend/src/stores/server/graphSync.ts`
(SSE → cache bridge, full read), `frontend/src/stores/server/dashboardStageControlsIntent.ts`,
and the `setQueryData` / inline-key sweeps across `frontend/src`. Grounded against the
codified rules (resource bounds, graph read discipline, wire contract, stable
selectors). Finding IDs `TQR-###`.

## Findings

### TQR-001 | info | verdict: an unusually well-engineered query layer — no actionable defect found

The implementation is exemplary across every dimension checked, with the reasoning
documented in place and traceable to prior review findings:

- **Key discipline.** Every query key in the app routes through a factory (`engineKeys`
  plus the timeline view key) — the inline-key sweep found ZERO bypasses. Keys are
  identity-complete per the graph rule: the graph slice folds scope, stable-serialized
  filter, as-of, granularity, lens, focus, and corpus (each documented with the ADR
  that made it identity-bearing); streams fold channels, since-offset, and scope so
  two resume points or two worktrees can never share an entry.
- **Bounds.** Global defaults are deliberately tight (staleTime 5 s, gcTime 120 s with
  the P-MED-9 rationale — graph slices are large and filter/scrub churn mints keys);
  heavy call sites declare their own bounds (content bytes, history, forge reads:
  per-observer caps + explicit gcTime); the one `staleTime: Infinity` (streams)
  carries an explicit `gcTime: 30s` and a 256-chunk ring cap, exactly the
  resource-bounds rule's demanded pairing, and the keyframe-advance path
  `removeQueries` the superseded stream entry immediately rather than waiting out gc.
- **Mutation discipline.** `updateDashboardStateCache` lands the PATCH response and
  then invalidates the exact key as a deliberate out-of-order convergence backstop
  (SRR-003, documented with its cost); the three racy write families are each guarded
  by mechanism, not hope — panel state and filters by per-scope serialized write
  chains that recompute their payload from the freshest cache inside the queued thunk
  (the SRR-001 lost-update fix), timeline mode by seq tokens that reject stale
  acceptances. The stage-controls intent never drops a write (`pending` is affordance
  only).
- **Live invalidation.** The SSE bridge is gap-safe in both directions (forward gaps
  AND backward clock resets from an engine restart re-keyframe through one
  stores-owned path), reconnect-to-empty is recognized as the restart signature,
  bursts collapse to one debounced targeted invalidation (P-HIGH-1), and the
  clean-feature-batch path deliberately skips invalidation entirely (the no-refetch
  `apply-deltas` splice). Connection truth feeds the degradation slice, never guessed
  from transport errors.
- **Failure honesty.** The query cache routes every error through the platform
  failure policy once; the retry predicate retries only classified-transient failures
  exactly once; error states poll for recovery on a bounded 8 s interval; the
  `withManualRetry` surface gives panels an honest user-driven refetch; stream
  reconnects back off exponentially to a 30 s ceiling (P-MED-3).
- **Render hygiene.** The graph slice rides `placeholderData: keepPreviousData` (the
  graph rule's smoothness mandate); the SSE bridge's zustand view obeys the
  stable-selectors rule with ref-preserving normalizers (GIR-009); facades are
  memoized on raw slices.
- **Gating.** Null/unresolved scopes disable their queries rather than fetching
  garbage, uniformly.

### TQR-002 | info | dashboard-state cache identity across a session swap self-heals; write path briefly targets the old key

The dashboard-state key folds a session identity derived from the cached session.
Imperative writes (`patchDashboardState`) read that identity at completion time, so a
PATCH resolving exactly across a session-identity change lands and invalidates the
OLD identity's key; the reader — already re-keyed to the new identity — fetches
fresh server truth on its own mount, so the system converges and the stale entry
evicts on gcTime. Latent by construction and self-correcting; no action. Recorded so
a future change to session-identity derivation keeps the both-sides-read-one-cache
property that makes this safe.

### TQR-003 | info | timeline view-state lives in the query cache — deliberate, bounded, but a second view-state home

`stores/view/timeline.ts` parks pure view state (playhead draft, zoom, scroll, lane
visibility, drag) in the query cache under a fixed key with
`staleTime/gcTime: Infinity` and an `initialData` factory. It is safe: one fixed-size
entry (no growth — rule-compliant), never evicted, subscribed through one memoized
facade. But it is the sole view-state citizen NOT in a zustand store, so the
"server state lives exclusively in TanStack Query" boundary reads blurred from the
other side. Uniformity observation only; migration to zustand would be cosmetic and
is not recommended as standalone work.

## Recommendations

- No remediation required — the first campaign audit in this series to close with
  zero actionable findings; the layer's quality bar (documented rationale per config
  choice, finding-id traceability in comments) is worth holding future stores work
  to.
- Keep TQR-002's invariant in mind if session-identity derivation ever changes, and
  fold timeline view-state into zustand only if that file is rewritten for other
  reasons (TQR-003).
