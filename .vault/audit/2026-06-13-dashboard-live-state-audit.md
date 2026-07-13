---
tags:
  - '#audit'
  - '#dashboard-live-state'
date: '2026-06-13'
modified: '2026-07-12'
related:
  - "[[2026-06-13-dashboard-live-state-plan]]"
  - "[[2026-06-13-dashboard-live-state-adr]]"
---

# `dashboard-live-state` audit: `live and degradation state plane`

## Scope

Formal Phase 5 review of the `dashboard-live-state` feature - the live and degradation
state-plane completion of the Data and State layer (the live-connection slice, the
StreamLostError disconnect contract, the graph-sync invalidation hook, the
degradation-truth derivation, and the policy binding), across commits for P01-P03 and
the stream fix swept into a concurrent cross-commit. Reviewed by the
`vaultspec-code-reviewer` persona against ADR D1-D5, the binding contract (sections
5/7/8), the project rules (`dashboard-layer-ownership`, `engine-read-and-infer`,
`mock-mirrors-live-wire-shape`), and the test/lint/type integrity mandates. Conducted in
a concurrent worktree where a parallel data-plane hardening campaign committed stores
fixes and adversarial tests during execution.

## Findings

**Verdict: PASS. No HIGH or CRITICAL findings.** All gates re-verified green by the
reviewer: typecheck clean, lint clean, 336 vitest tests (70 files), production build, 6
live adverse e2e in Chromium, and `vault check all` (only pre-existing warnings on
unrelated features). The feature delivers exactly what the ADR commits; the
engine-blocked no-refetch delta-apply (S50) is honestly flagged at the seam, not faked.

Mandate verification, all passing:

- **ADR D1/D4 (no upward import, mechanism vs vocabulary):** `matrix.ts` imports only
  zustand and the `EngineStatus` type; `deriveInputs(status, live)` is pure (signals
  injected, never read from a store inside it). `useDegradation.ts` reads the
  `useLiveStatusStore` stores hook from app (the allowed direction) and maps to surfaces.
  The stream consumer recognizes failure via the platform-owned `StreamLostError`
  (imported downward), nothing upward.
- **D2 (disconnect contract):** `sseChunks` throws `StreamLostError` on non-ok/abnormal
  close, returns on clean `done`, and re-throws an intentional `AbortError` untouched
  (the `isAbort` guard) so a deliberate cancel never flashes the degraded surface; the
  reader is always released in `finally`.
- **D3 (invalidation, not a workaround):** `useGraphLiveSync` drives targeted
  constellation invalidation (prefix key, `exact:false`, verified to match) plus the
  connection signal; it does not build a client-side constellation delta-apply over the
  engine-blocked seq baseline, and the block is flagged in prose (`engine-read-and-infer`
  honored). Effect deps cause no resubscribe storm; the `isError`-first ordering keeps a
  real lost signal from being clobbered.
- **Stream fix (adversarial stream-01):** the resume `since` is folded into
  `engineKeys.stream` and a seq-dedup reducer replaces blind append; both stream-01
  assertions are green (~0.6s, no timeout - the reviewer corrected an earlier note: the
  mock's bounded `since=` close, a concurrent campaign fix, settles the reconnect
  assertion). NowStrip's length-delta effect is unaffected (the reducer only suppresses
  duplicates, never shortens).
- **Degradation truth (finding 036 closed):** `streamLost` derives from
  `streamConnected === false` only (excludes the initial null); `brokenLinkCount` is a
  pure reduction over the held slice's broken edges, emitting 0 when no slice is held
  (no stale count on scope swap). The section 8 reconnecting/stale and broken-highlighted
  rows are reachable from real data and proven live (the e2e renders RECONNECTING).
- **Test integrity:** no tautologies, no quality-masking mocks; the graph-sync test
  seeds the real query cache and asserts the hook's real observable effects; the e2e flip
  is a faithful proxy for the policy-bound StreamLostError path.

Findings raised and their resolution in the post-review revision:

- **MEDIUM-1 (resolved):** `lastSeq` was tracked but never fed back as the live
  subscription's `since=`, leaving the resume machinery dead for the live consumer.
  Resolved by documenting the deliberate design at the subscription seam: the live hook
  subscribes at the live tail (no `since=`) to avoid resubscribe churn, and `lastSeq` is
  staged for the future engine-unblocked delta animation's precise resume; the dedup
  reducer and resume-key fix protect that future path and the diff/scrub `since=` path,
  which the adversarial test exercises.
- **LOW-1 (acknowledged):** the earlier exec-record note that the stream-01
  reconnect-dedup assertion times out was stale - the shipped test passes. The exec
  record was corrected to reflect reality.
- **NIT-1 (resolved):** the `engineStreamOptions` JSDoc still said "append mode"; updated
  to "seq-dedup reducer".
- **NIT-2 (resolved):** the `useDegradation` header comment was extended to name the
  live-connection slice it now composes.

## Recommendations

- When the engine unblocks the constellation seq baseline (S50: constellation-granularity
  `asof`/`diff` accepting the contract's `<ts|sha>` timestamps and synthesizing feature
  nodes), thread `lastSeq` into the live subscription and replace invalidation with the
  no-refetch delta animation onto the held scene model - the live-connection slice and
  the resume/dedup machinery are already laid for it.
- A debounce on the stream-lost signal (noted in ADR Consequences) would prevent a brief
  reconnect blip from flashing the degraded surface; worth adding when reconnection
  telemetry exists.
- The concurrent hardening campaign's `__adversarial__` stores suite is now green
  alongside this feature; keep both green as the data-plane hardening continues.

## Codification candidates

Deferred per the `vaultspec-codify` cross-cycle bar (first encounter). The ADR's
`live-connection-state-is-stores-owned` candidate (the runtime stream-connection signal
lives in `stores/`, read by `app/degradation`, never hardwired) is well-supported by this
implementation and reinforces the platform ADR's `platform-owns-mechanism-not-vocabulary`
candidate; both are recorded, not promoted, to revisit when a second feature exercises
the live-connection state.
