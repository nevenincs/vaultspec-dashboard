---
tags:
  - '#reference'
  - '#a2a-integration-verification'
date: '2026-07-31'
modified: '2026-07-31'
body_schema: 'body-v1'
body_hash: 'sha256:c826b38a9ddf7448f87de6960af89d9e2b100ef8f50e8727b5b6f628830abf48'
related: []
---

# `a2a-integration-verification` reference: `verification surface inventory`

## Summary

What of the dashboard-to-a2a agentic loop is authored, what is tested, and what
is neither. Every claim below was confirmed by reading the cited source; claims
carried in from earlier sessions that could not be reconfirmed are marked as
such.

### The surface is authored, and more complete than a name-based search suggests

Production code exists for the driving surface and preset selection
(`app/agent/Composer.tsx`), the view face (`app/agent/Transcript.tsx`,
`app/agent/AgentPanel.tsx`), tool-call rows and an inline permission prompt with
allow and deny actions (`app/agent/ToolCallEntry.tsx`, using
`useDecideToolPermission` and `useResumeInterrupt`), the transcript model with
its bounds (`stores/view/agentTranscript.ts`: `AgentToolCallRecord`,
`AgentThinkingSegment`, `AgentToolPermissionDecision`, a 64 tool-call cap and a
20 thinking-segment cap), stop and retry (`stores/view/agentActions.ts`), frame
classification and reduction (`stores/server/liveAdapters/a2aRelay.ts`), and an
engine-side run-progress relay over server-sent events
(`routes/ops/a2a_stream.rs`) backed by a real broadcast subscription.

A method note that cost real time: a keyword search over source names missed the
tool-approval component entirely, and semantic search found it in one query. An
inventory built from guessed identifiers will understate what exists.

### Three test layers each defer the working path, and the last does not exist

- Dashboard live store suites spawn the engine deliberately without a resident
  a2a. Three of them state this in their own headers and each names a future
  cross-repository end-to-end as where the a2a-up path will be proven:
  `stores/server/agent/a2aTeam.live.test.ts`,
  `stores/server/a2aLifecycle.live.test.ts`, and
  `app/agent/ProposalCard.live.test.tsx`. What they prove is the degraded
  posture: the pass-through round-trips, every response carries the tier block,
  and the team selector renders disabled with a reason.
- The cross-repository end-to-end they defer to has never been built.
- a2a's gateway live tests do not close the gap. Their worker is an in-process
  recorder (`api/tests/conftest.py`, class `_InProcessWorker`) that appends
  dispatch request bodies to a list over real HTTP and never executes a graph.
  The suite header states that no mocks are used while substituting exactly the
  component whose execution matters.
- a2a's graph tests do execute graphs but inject a fake chat model through the
  provider protocol, bypassing the real factory chain.

The path executed by no test in either repository is therefore: gateway, worker
process, compiled graph, real provider factory, mock chat model, and the
model-wrapping seams in the worker node.

### The first manual cold run, and exactly what it proved

Engine and a2a were started on one machine and wired both ways: a2a against a
scratch application home, the engine pointed at that home, and a2a pointed back
at the engine's own service record.

Proven: both directions reachable, with a2a reporting the authoring backend
reachable and the engine reading a2a's readiness; run admission open with no
degraded reasons; a dispatched run returning a run identity, a running status and
a bound lease; and two generation fences correctly refusing input that did not
match the served scope.

Not proven, and this is the larger half: not one streamed frame, not one tool
call, not one permission decision, no stop, no retry, and no surface consuming
any of it.

The run then failed inside a2a's own mock preset, with the worker logging that
its effective model resolved to a tuple. The failure propagated correctly:
the graph failed the thread, the gateway marked it terminal, and the engine
relayed the failure accurately.

### Deliberate boundaries that are not defects

- The engine attaches, never owns. It reaches whatever a2a is resident through
  that service's own discovery record, and the reader for that record matches
  the live record field for field.
- A second, product-shaped discovery record is read by the dashboard lifecycle
  plane and written by nobody on either side. Its reader states in its own words
  that the plane reads it and never writes it. Until a producer exists, a test
  over it could not fail for the right reason.
- Eight of ten typed lifecycle operations return an honest pending-effect
  refusal rather than fabricating success, and two underlying controller
  operations are unconditional refusals.

### Open questions, each with the check that would settle it

- The tuple model resolution has no static root cause. Every call site unpacks
  the three-tuple correctly and the wrapping seams return models on their visible
  paths. Settled by one instrumented dispatch in the real worker process logging
  the model type after each seam.
- A readiness inconsistency observed during the manual run, where a preset
  listing advertised provider readiness and the dispatch envelope did not,
  contradicts a green agreement test in a2a. Settled by comparing the resident
  build's commit against that test's landing commit, and by identifying which
  surface reported the negative.
- Whether the existing authoring end-to-end harness recipe carries over to a
  two-process spawn. Settled by reading that harness whole before authoring the
  new one.
