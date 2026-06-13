---
tags:
  - '#adr'
  - '#dashboard-live-state'
date: '2026-06-13'
modified: '2026-06-13'
related:
  - "[[2026-06-13-dashboard-live-state-research]]"
  - "[[2026-06-13-dashboard-platform-adr]]"
  - "[[2026-06-12-dashboard-gui-adr]]"
---



# `dashboard-live-state` adr: `live and degradation state plane` | (**status:** `accepted`)

## Problem Statement

A new feature completing the unwired remainder of the Data and State layer. The state
machinery is built and tested, but the live data plane never animates and two rows of
the section 8 degradation matrix are dead because their inputs are hardwired: the live
`graph` SSE channel has no consumer, `streamLost` is hardwired `false`, and
`brokenLinkCount` is hardwired `0`. Under the dashboard's degrade-truthfully thesis a
hardwired degradation input is the GUI lying about availability. This ADR commits how
the state system models live-connection state, surfaces the stream-lost and
structural-broken truths, and makes LIVE mode reactive - building only the part the
engine already supports, and flagging the part it does not.

## Considerations

- **The single delta clock already exists** (`scene/deltaLog.ts`, seq-driven) and
  `TimeTravelDriver.spliceLive` is built for live splicing but unused; the
  query/SSE/adapter apparatus (`stores/server/`) is complete. This is wiring, not new
  machinery (research F1).
- **The contract's stated liveness path** (the `stores/server/queryClient.ts` comment,
  contract section 7, GUI ADR G4.b) is "targeted cache invalidation + small live slices"
  from the stream - invalidation is a first-class, buildable liveness mechanism, not a
  fallback.
- **The platform policy already classifies stream-lost** (`StreamLostError` ->
  `degraded`/`stream-lost`); the platform audit assigned the `setDegradationHandler`
  binding to this team (mechanism here, vocabulary in app: platform ADR D4).
- **The mock serves the `graph` channel** (`{op,node,edge,t,seq}` with `since=` replay),
  so the live wire shape is testable (`mock-mirrors-live-wire-shape`).

## Constraints

- **No upward import; mechanism vs vocabulary.** The stores layer expresses
  live-connection and broken-count *state*; `app/degradation` reads it through its hook
  and maps it to surface states. The degradation matrix stays in `app/`
  (`dashboard-layer-ownership`).
- **The live constellation delta-apply is engine-blocked.** Applying live deltas onto a
  keyframe with seq dedup needs the keyframe's `seq`; the live constellation keyframe
  (`/graph/query`, feature granularity) carries none, and constellation `asof`/`diff`
  (the seq source) is the open S50 divergence. Building a client workaround would
  violate `engine-read-and-infer`; the no-refetch animation is flagged, not forced.
- **Stateless scope preserved.** A live-connection slice keys by scope and resets on the
  wholesale scope swap (findings 022/023), like the rest of the view stores.
- **Parent stability.** Builds only on shipped surfaces (the delta clock, the platform
  failure policy, TanStack Query v5 invalidation, the existing degradation matrix).

## Implementation

Five decisions complete the live and degradation plane:

- **D1 - Live-connection state slice (stores-owned).** A new small Zustand slice under
  `stores/` holds the runtime liveness state the system does not model today:
  `streamConnected` and `lastSeq` (the `since=` resume point), keyed by scope. It is the
  single source both the degradation derivation and the stream resume read.

- **D2 - Stream-consumer disconnect contract.** The SSE consumer throws `StreamLostError`
  (the platform-owned type) on an abnormal close or a non-ok stream response, instead of
  the current bare `Error`; a clean end-of-stream is not an error. A stores-owned
  graph-sync hook tracks connect -> sets `streamConnected = true`, disconnect -> throws
  through the query-error router and sets `streamConnected = false`; a successful
  reconnect clears the signal. Reconnect rides TanStack Query's streamed-query retry.

- **D3 - Live reactivity by targeted cache invalidation.** The graph-sync hook
  subscribes the live `graph` channel and, on each new delta batch, invalidates the
  constellation graph slice (the contract's stated liveness mechanism) and advances
  `lastSeq`. This makes LIVE mode reactive to wire changes without the seq-dependent
  no-refetch animation. The no-refetch delta-apply onto the held scene model remains
  engine-blocked (S50 constellation seq) and is documented as such at the seam, so a
  future agent does not mistake invalidation for the whole live-clock story.

- **D4 - Degradation truth derivation.** `deriveInputs` reads `streamLost` from the
  live-connection slice (`!streamConnected` while a stream is expected) and
  `brokenLinkCount` as a pure reduction over the held slice's edges
  (`state === "broken"`), replacing the two hardwired literals. The section 8
  `reconnecting`/`stale-badged` and `broken-highlighted` rows go live. The derivation
  reads state the stores own; the mapping to surfaces stays in `app/degradation`.

- **D5 - Policy binding in app bootstrap.** App bootstrap binds
  `failurePolicy.setDegradationHandler` so a `degraded`/`stream-lost` classification
  flips the live-connection slice's `streamConnected = false` - the platform-policy
  adoption the platform audit named, closing the classify -> surface loop without the
  stores importing the policy's vocabulary.

## Rationale

D1 follows from research F4: liveness is a state the system must model to surface it
truthfully, and a scope-keyed slice matches the existing view-store discipline. D2/D3
follow from F2/F3: the contract's own stated path is invalidation, which is buildable
and testable today, while the delta-apply is honestly blocked - so we build the half
that is real and flag the half that is not, per `engine-read-and-infer`. D4 is the
degrade-truthfully thesis made real: the two dead rows were the GUI's two standing
availability lies. D5 is the mechanism/vocabulary split (platform ADR D4) realized: the
policy classifies, the app binds, the stores hold the signal, and nothing imports
upward.

## Consequences

- **Gains.** Two degradation truths the GUI could not previously tell now render from
  real data; LIVE mode becomes reactive to wire changes; the live-connection state is a
  first-class, testable part of the state system; the platform policy's stream-lost
  classification finally drives a surface.
- **Honest difficulties.** The no-refetch live animation is deferred to an engine
  change (S50); invalidation-driven liveness refetches the keyframe, which is correct
  but heavier than delta animation - acceptable for a loopback engine, and the seam is
  shaped so the animation drops in when the seq baseline lands. The reconnect/stream-lost
  signal must debounce so a brief blip does not flash the degraded surface.
- **Pathways.** The live-connection slice and the `since=`/`lastSeq` resume point are
  exactly the inputs the future delta-animation needs; this feature lays them.

## Codification candidates

Deferred (first encounter; the `vaultspec-codify` bar requires holding across a cycle).
Candidates: `live-connection-state-is-stores-owned` (the runtime stream-connection
signal lives in `stores/`, read by `app/degradation`, never hardwired); and a
reinforcement of the existing `mechanism-vs-vocabulary` candidate from the platform ADR.
Recorded, not promoted.
