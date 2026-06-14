---
tags:
  - '#audit'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - '[[2026-06-14-user-state-persistence-plan]]'
  - '[[2026-06-14-user-state-persistence-adr]]'
  - '[[2026-06-14-user-state-persistence-research]]'
---



# `user-state-persistence` audit: `live production verification and hardening campaign`

## Scope

A live, manual verification-and-hardening campaign of the `user-state-persistence` backend
(the `vaultspec-session` orchestration crate, the multi-scope registry in `vaultspec-api`,
and the session/settings API) exercised against **real production vault data**, not the test
suite. The freshly built engine binary was run as `vaultspec serve` and driven over HTTP with
a bearer token. Two live corpora were used: the dashboard's own vault (276 graph nodes /
10012 edges, ~500 documents across `adr`/`plan`/`audit`/`research`/`exec`/`reference`/`index`)
for single-scope correctness and durability, and the `vaultspec-rag` git-worktree workspace
(four worktrees: a 613-document `main`, a 613-document feature branch, an empty feature
branch, and an agent worktree) for the multi-scope registry. Data protection was a hard
constraint throughout: only read endpoints plus session/settings (whose writes land solely in
the gitignored `.vault/data/engine-data/` cache zone) were exercised; no vault-mutating verb
was called.

## Findings

### Verified live (no defects)

- **PASS - durable persistence ends reload amnesia.** Setting an active scope context
  (`folder`, `feature_tags`) and a user setting, then **fully restarting the engine process**,
  restored all of it from `user-state.sqlite3` on the next request. This is the feature's
  headline claim, proven against live data with a real process restart, not a mock.
- **PASS - the store is a separate file.** A dedicated `user-state.sqlite3` sits beside
  `engine.sqlite3` and `service.json` in the gitignored cache zone, never co-located in the
  re-derivable engine cache.
- **PASS - session and settings roundtrip.** `GET`/`PUT /session` (active scope, scope
  context, recents) and `GET`/`PUT /settings` (`global` + sparse `scoped`) read back exactly
  what was written.
- **PASS - multi-scope registry retargets reads.** `/map` enumerated every worktree;
  switching the active scope across three live worktrees served three distinct, correct graphs
  (613 nodes, 0 nodes, 613 nodes) - the empty-branch case proving the engine genuinely rebuilds
  per scope rather than reusing one graph. A warm-cell switch completed in ~0.04 s.
- **PASS - scope validation is honest.** An unknown path was rejected with HTTP 400 ("not a
  selectable worktree in this workspace") carrying the tiers block, and the active scope was
  left unchanged.
- **PASS - degradation truthfulness on a real edge case.** Switching to a worktree that lacks
  a `.vaultspec/` directory degraded the `declared` tier to unavailable with a clear reason
  instead of crashing.
- **PASS - per-scope SSE clock.** `/stream` honored the `scope` parameter and, for a `since=0`
  resume against a scope whose ring tip was ~12.5k deltas deep, correctly emitted a `gap` event
  (`oldest_buffered` reported) so the client re-keyframes - proving each scope owns an
  independent monotonic clock and ring.
- **PASS - tiers block on every wire response,** including the framework-boundary errors: a
  malformed-JSON body (400) and a missing-required-field body (422) both returned a JSON
  envelope carrying the per-tier block, confirming the `ensure_tiers_envelope` safety net works
  on the live wire.
- **PASS - robust under adversarial input and concurrency.** Malformed JSON, a missing field,
  a bogus node id (404 with tiers), a wrong bearer token (401), and twenty rapid concurrent
  scope-switch `PUT`s were all handled gracefully; the server remained healthy afterward
  (watcher resident, graph intact). No panic, no wedged lock, no crash.
- **PASS - data protection held.** After all runs, neither live project had a single new
  tracked-file change attributable to serving; the read-and-infer engine wrote only to the
  gitignored `.vault/data/` zone, and no `engine/` or `frontend/` source was touched.

### LOW - characteristics worth noting (not defects)

- **LOW - cold scope-switch latency on large worktrees.** The first switch to a cold 613-document
  worktree exceeded a 10 s client timeout because `get_or_build` builds the new scope's graph
  synchronously while the `PUT /session` response blocks. Once warm, switches are ~0.04 s. A
  short-timeout client sees the first switch as pending/failed even though the server completes
  it. Acceptable under the prototype posture; the UI should show a building state and use a
  generous timeout.
- **LOW - working-set-cap eviction was not force-tested live.** The cap is six and the available
  live workspaces had at most four worktrees, so eviction could not be triggered. Eviction
  teardown (the watcher-cycle fix) remains covered by the runtime-present regression test added
  during the build review.
- **NIT - read-surface envelope nesting.** `/filters` returns its vocabulary under
  `data.vocabulary` and `/events` under `data.payload`; both are pre-existing engine shapes the
  frontend's tolerant adapters already normalize, not regressions from this feature.

## Recommendations

- Accept the backend as verified against live production data: every claimed capability held and
  no CRITICAL or HIGH defect surfaced. The campaign satisfies the verification goal.
- For the cold-switch latency, when this graduates beyond a prototype, consider warming the next
  scope asynchronously (return immediately, stream a building state) or raising the client
  timeout and surfacing progress, so a first switch to a large worktree never reads as a failure.
- Revisit the working-set-cap eviction with a synthetic many-worktree fixture if a future change
  touches the registry, since live workspaces small enough to fit under the cap cannot exercise it.

## Codification candidates


None from this campaign. The verification surfaced no new durable cross-session constraint:
the backend behaved exactly as the ADR and reviews claimed, and the two LOW characteristics
(cold-switch latency, untested cap eviction) are prototype-stage notes, not constraints that
should bind future agents. The one standing candidate remains the build-phase
`orchestration-crate-is-the-read-and-infer-exception` named in the ADR, still deferred per the
one-cycle codify discipline; this live pass is corroborating evidence that the orchestration
crate respects its read-and-infer fence (it wrote nothing tracked, only its own gitignored
state), strengthening that candidate for promotion next cycle.

