---
tags:
  - '#plan'
  - '#constellation-live-delta'
date: '2026-06-13'
modified: '2026-06-15'
tier: L1
related:
  - '[[2026-06-13-constellation-live-delta-adr]]'
  - '[[2026-06-12-dashboard-foundation-reference]]'
  - '[[2026-06-13-constellation-live-delta-research]]'
  - '[[2026-06-12-vaultspec-engine-adr]]'
---


# `constellation-live-delta` plan

- [x] `S01` - Add a granularity tag to the diff entry so document deltas declare their species; `engine/crates/engine-graph/src/diff.rs`.
- [x] `S02` - Project the rebuild diff to feature-granularity meta-edge and feature-node deltas on the shared seq clock; `engine/crates/engine-query/src/graph.rs`.
- [x] `S03` - Emit both delta species on the single clock, carry last_seq on the live keyframe, and honor diff granularity; `engine/crates/vaultspec-api/src/app.rs`.
- [x] `S04` - Assert the keyframe seq anchor, feature-granularity diff, and granularity-tagged stream in conformance and certify end to end; `engine/tests/tests/conformance.rs`.
- [x] `S05` - Extend client wire types: add `granularity` discriminator to `GraphDeltaEntry` and `last_seq` to `GraphSlice`; `add `graphDeltaToScene` mapping in `sceneMapping.ts`; `frontend/src/stores/server/engine.ts`, `frontend/src/scene/sceneMapping.ts`.
- [x] `S06` - Upgrade `useGraphLiveSync` to subscribe `graph` with `since=keyframeSeq`, extract `granularity=feature` deltas, and fall back to invalidation on gap; `Stage.tsx` maps and routes feature deltas to `SceneController` via `apply-deltas`; `frontend/src/stores/server/graphSync.ts`, `frontend/src/app/stage/Stage.tsx`.
- [x] `S07` - Add unit tests for `graphDeltaToScene`, `since=keyframeSeq` subscription, and gap→invalidation fallback; `run typecheck, lint, test, build gates green; `frontend/src/scene/sceneMapping.test.ts`, `frontend/src/stores/server/graphSync.test.ts`.
## Description

Binding implementation of the accepted `constellation-live-delta` ADR (S50): the
live feature constellation must animate from the stream without refetching. The
contract amendment (sections 4/5/7) is landed; this plan executes the engine
capability behind it. Today `commit_graph` diffs only the document
`LinkageGraph` and the feature meta-edges are never diffed or streamed, and the
live `/graph/query` keyframe carries no `seq` - so a held constellation cannot
splice live deltas. The contract forbids the GUI from deriving the constellation
from document edges (section 4), so the engine must project.

S01 tags every document delta with `granularity: "document"` (the wire entry
becomes `{op, granularity, node?, edge?, t, seq}`). S02 adds a feature-projection
delta in the query core: it computes the old and new feature projections (feature
nodes + meta-edges) and diffs them by stable id into `granularity: "feature"`
delta entries on the shared seq clock. S03 wires it: `commit_graph` emits the
document deltas then the feature deltas on the single monotonic clock (broadcast
on the `graph` channel), the live `/graph/query` response carries `last_seq` (the
clock tip), and `/graph/diff` honors `granularity=feature`. S04 asserts the seam
in conformance and certifies end to end. S01–S04 (engine half) are complete.

S05–S07 are the frontend consumer addendum, now unblocked. S05 propagates the
wire-contract amendments into the TypeScript client: `GraphDeltaEntry` gains a
`granularity` discriminator and `GraphSlice` gains `last_seq?: number | null`;
`sceneMapping.ts` gains `graphDeltaToScene` which maps one engine delta entry to
a `SceneDelta` for the scene layer (returns `null` for entries without a matching
node or edge, which are dropped). S06 upgrades `useGraphLiveSync`: it now accepts
the constellation keyframe's `last_seq` and subscribes the `graph` channel with
`since=keyframeSeq` so only new deltas arrive; it extracts entries tagged
`granularity=feature` and returns them for the app layer to route; on a detected
gap (`needsKeyframe`) it signals Stage to fall back to `invalidateQueries` (the
resilient floor from the live-state ADR). Stage.tsx maps returned entries via
`graphDeltaToScene` and pushes `apply-deltas` to `SceneController` — no refetch.
The `since=lastSeq` on reconnect uses `useLiveStatusStore.lastSeq` (the furthest
seq seen), not the initial keyframe seq, so reconnects resume correctly without
re-keyframing. S07 closes the gate: unit tests for the mapping, the
`since=keyframeSeq` key distinction, and the gap→invalidation path; all four
frontend green gates must pass before the plan closes.

## Parallelization

S01 is the wire-shape prerequisite for S02/S03. S02 (the projection) and S03
(the wiring + keyframe seq + diff granularity) are sequential (S03 consumes
S02). S04 is last (it asserts the other three). S01–S04 are complete.

S05 is the prerequisite for S06 (S06 uses the types S05 adds). S06 is the
prerequisite for S07 (S07 tests the wiring S06 implements). Single review
boundary at S07 completion, per the standing per-phase discipline.

## Verification

Engine half (S01–S04, complete):
- The live `/graph/query` response (both granularities) carries a NUMERIC
  `last_seq`; `as_of` keyframes carry `last_seq: null`.
- `GET /graph/diff?granularity=feature` returns feature-node + meta-edge deltas,
  each tagged `granularity: "feature"`; `granularity=document` (default) is
  unchanged and tagged `document`.
- The `graph` SSE channel emits both species, granularity-tagged, on the single
  monotonic clock; `since=<seq>` resumes on the GLOBAL seq with no gap/overlap;
  meta-edge delta ids are stable across re-derivation (provenance-stable keys).
- Engine `cargo test --workspace`, `clippy --all-targets -D warnings`, and
  `fmt --check` green.

Frontend consumer addendum (S05–S07):
- `GraphDeltaEntry` carries `granularity?: "document" | "feature"`; `GraphSlice`
  carries `last_seq?: number | null` on live responses.
- `graphDeltaToScene` maps engine delta entries to `SceneDelta`; entries missing
  both node and edge return `null` and are filtered.
- `useGraphLiveSync` subscribes `graph` with `since=keyframeSeq` on initial mount
  and `since=lastSeq` on reconnect; the `engineStreamOptions` cache key differs
  between `since=undefined` and `since=N` (the stream-01 adversarial property).
- Feature-granularity deltas reach `SceneController` via `apply-deltas` without
  an intervening query invalidation (no refetch on the happy path).
- A gap in the seq stream triggers `invalidateQueries` (the resilient floor), not
  a silent drop or a scene corruption.
- `npm run typecheck`, `npm run lint`, `npm run test` (71 test files), `npm run
  build` all green; adversarial suite included.
- `vaultspec-core vault check all` green; every Step closed (`- [x]`); review
  before closure.
