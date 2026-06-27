---
tags:
  - '#research'
  - '#dashboard-live-state'
date: '2026-06-13'
modified: '2026-06-13'
related:
  - "[[2026-06-12-dashboard-gui-adr]]"
  - "[[2026-06-13-dashboard-platform-adr]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
---

# `dashboard-live-state` research: `live and degradation state plane`

The Data and State layer (`frontend/src/stores/`) is the frontend's nervous system: the
sole client of the engine wire, owner of the query cache, the SSE delta clock, and the
per-tier degradation block. A gap analysis against the binding ADRs and the wire
contract found the layer's *machinery* substantially built and tested - every contract
query family has a typed hook, the `(scope, filter, as_of, granularity)` cache-key
triple is honored, the single seq-driven delta clock exists, and the live-origin
anti-corruption adapters pass. What is missing is not new machinery but the *wiring of
built consumers to built producers*: the live data plane never animates, and two rows of
the degradation matrix are dead because their inputs are hardwired. This research grounds
exactly which capabilities the binding contract requires, which are buildable now, and
which are blocked on engine work, so the feature delivers only the honest, testable
remainder. It is the `src/stores/` leg of the standing data-plane hardening goal.

## Findings

### F1 - The state machinery exists; the live and degradation plane is unwired

Confirmed against the tree (evidence as `file:line`):

- **Live graph deltas are never applied.** The only stream subscriber is `NowStrip`
  (`app/right/NowStrip.tsx`, channels `backends`/`git`); nothing subscribes the `graph`
  channel. `TimeTravelDriver.spliceLive` (`app/timeline/timeTravel.ts`) is built to
  splice live graph deltas onto the single clock but has zero production callers. In
  LIVE mode the stage only refreshes when `useGraphSlice` refetches; there is no live
  delta path and nothing invalidates the graph slice on a wire change.
- **`streamLost` is hardwired false.** `deriveInputs` (`app/degradation/matrix.ts`)
  sets `streamLost: false` with the comment "owned by the stream consumer".
  `StreamLostError` is defined and classified by the platform policy
  (`platform/policy/failurePolicy.ts`, `degraded`/`stream-lost`) but is never thrown -
  `sseChunks` (`stores/server/queries.ts`) throws a bare `Error` and returns silently
  on `done`. `setDegradationHandler` has no production caller. The matrix's
  `reconnecting`/`stale-badged` row is therefore unreachable from real data (GUI audit
  finding 036).
- **`brokenLinkCount` is hardwired 0.** `deriveInputs` sets it to 0 with the comment
  "surfaced per-slice by the edge layer". The per-edge `state: resolved|stale|broken`
  is typed and consumed by the broken-links lens, but the count that drives the
  `broken-highlighted` stage state is never computed from the held slice.

### F2 - What the binding contract requires here

- **Contract section 7 + GUI ADR G4.b:** the live `graph` SSE channel shares the
  section 5 single delta clock; the GUI "animates without refetching" and resumes via
  `since=<seq>`. The foundation comment in `stores/server/queryClient.ts` records the
  intended path explicitly: "SSE streams will feed targeted cache invalidation + small
  live slices once the engine's `/stream` lands."
- **GUI ADR G8.a (degradation is a spec, not an error path) + the section 8 matrix:**
  the stream-lost and structural-broken rows are designed states the client must render
  truthfully; with their inputs hardwired the GUI cannot tell those truths.
- **Platform ADR D4 (mechanism here, vocabulary in app):** stream-lost is classified by
  the platform policy; the binding to a degradation surface is the app's, via the
  injected `setDegradationHandler`. This is the exact adoption the platform audit
  assigned to the Data team.

### F3 - The buildable remainder vs the engine-blocked part

The full live *delta animation* for the top-level constellation is **engine-blocked**:
applying live deltas onto a keyframe with seq dedup needs the keyframe's seq, but the
live constellation keyframe comes from `/graph/query` at feature granularity, which
carries no `seq`; constellation-granularity `asof`/`diff` (the source of a seq baseline)
is the open S50 divergence (the engine parses `t/from/to` as git revisions only and does
not synthesize constellation asof). Building a client workaround would violate
`engine-read-and-infer`. The mock's `graph` channel does serve `{op,node,edge,t,seq}`
with `since=` replay, so the *shape* is testable.

Buildable now, ranked by centrality:

- **GAP-2 (degradation truth - stream lost).** Throw `StreamLostError` from the stream
  consumer on disconnect/error; let the query-error router classify it; bind
  `setDegradationHandler` in app bootstrap to flip a live-connection signal a new
  stores-owned slice holds; `deriveInputs` reads it. All four pieces exist unwired.
- **GAP-3 (degradation truth - broken links).** Derive `brokenLinkCount` as a pure
  reduction over the held slice's edges (`state === "broken"`) and feed `deriveInputs`.
- **GAP-1 buildable half (live reactivity).** Subscribe the live `graph` stream and use
  it to drive *targeted cache invalidation* of the constellation query (the contract's
  stated liveness mechanism) plus a connection/last-seq signal - making LIVE mode
  reactive without the seq-dependent no-refetch animation. The no-refetch delta-apply
  stays flagged on the S50 constellation-seq blocker.

### F4 - Design implications for the ADR

- A new stores-owned **live-connection state slice** is needed (the runtime
  `streamConnected` / `lastSeq` the matrix and the resume point both read) - the state
  system gains a first-class liveness state it does not model today.
- The **mechanism/vocabulary split** holds: stores expresses the live-connection and
  broken-count *state* (data); `app/degradation` reads it through its hook and maps it
  to surface states (vocabulary). No upward import; the degradation matrix stays in
  `app/`.
- `mock-mirrors-live-wire-shape` binds: the mock already serves the `graph` channel
  shape, so the consumer must be proven against a captured/served frame.

### Open questions routed to the ADR

1. Where does the live-connection state slice live and what does it hold?
2. What is the stream-consumer disconnect contract (when is `StreamLostError` thrown,
   and how does reconnect clear the signal)?
3. How does the live stream drive invalidation without re-creating the keyframe churn,
   and how is the engine-blocked delta-apply flagged so a future agent does not mistake
   the invalidation path for the whole story?
