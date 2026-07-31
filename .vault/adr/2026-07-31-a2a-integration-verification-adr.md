---
tags:
  - '#adr'
  - '#a2a-integration-verification'
date: '2026-07-31'
modified: '2026-07-31'
body_schema: 'body-v1'
body_hash: 'sha256:d87bd2249fe65bc4529a50b911c137d497ebd9628ab1a6468b46979eb38f4927'
related:
  - '[[2026-07-31-a2a-integration-verification-verification-surface-inventory-reference]]'
  - '[[2026-07-24-a2a-product-provisioning-adr]]'
---

# `a2a-integration-verification` adr: `prove the agentic loop against a real a2a: harness placement, a model-only double, and a staged substrate` | (**status:** `accepted`)

## Problem Statement

Every component of the dashboard's agentic surface is authored and none of it is
verified against a running a2a. The driving surface, the transcript, tool-call
rows, the inline permission prompt with its allow and deny decision, stop and
retry, and the engine's run-progress relay all exist as production code. What has
never happened is any automated exercise of them against a counterparty that
answers.

Three test layers each defer the working path to the next, and the last does not
exist:

- The dashboard's live store suites spawn the engine deliberately WITHOUT a
  resident a2a. They are honest degraded-path proofs, and three of them say so in
  their own headers, each naming a future cross-repository end-to-end as the
  place the a2a-up path will be proven.
- That cross-repository end-to-end was never built.
- a2a's own gateway live tests do not close the gap either. Their worker is an
  in-process recorder that captures dispatch bodies over real HTTP and never
  executes a graph, so they prove dispatch TRANSPORT and never dispatch
  EXECUTION, while their header states that no mocks are used.
- a2a's graph tests do execute graphs, but inject a fake chat model through the
  provider protocol, bypassing the real factory chain.

A fourth layer sharpens rather than closes this. a2a does own real-process
certification harnesses that spawn the production gateway armed to own and spawn
its own worker, one of them wiring the tape server too. But those harnesses state
their own scope: their scenarios are deliberately provider-independent, holding
whether a run ultimately completes or fails. So the precise hole is not that no
test spawns the real chain. It is that NO TEST ON EITHER SIDE REQUIRES A RUN TO
COMPLETE THROUGH THE MODEL CHAIN.

That is exactly where the live defect sits. A worker resolved its effective model
to a tuple, which is a type fault upstream of any network call: an absent tape
server would have produced a connection error against a named model class, not a
tuple. The first manual run ever attempted surfaced it immediately because it was
the first attempt that required completion.

This is not a coverage shortfall. It is three green suites, each substituting the
seam the next one needed, which is the failure this project has met repeatedly: a
check that passes while structurally unable to observe the thing it names.

## Considerations

- A first manual cold run proved the transport: both directions reachable, run
  admission open, a dispatched run returning a run identity and a bound lease,
  and two generation fences correctly refusing malformed input. It proved nothing
  about streaming, tool calls, approvals, stop, retry, or any surface consuming
  them.
- The dashboard already owns the right harness precedent: an authoring end-to-end
  suite that spawns a real engine binary into its own scratch git worktree,
  mirroring the unit-test recipe and adding a restart capability for durability
  proofs. It is an established live lane, not a pattern to invent.
- The engine's contract with a2a is attach-never-own: it reaches whatever service
  is resident through that service's own discovery record. Eight of ten typed
  lifecycle operations are honest stubs that report a pending gateway-control
  effect rather than fabricating success.
- a2a exposes a mock provider as a first-class citizen through its real factory
  and ships bundled mock presets with an explicit mock marker. That mock is NOT
  self-contained: it proxies over HTTP to an external tape server on a fixed
  loopback port, provisioned by container compose. A double built on it needs a
  third process, which narrows the lane to hosts where that container runs.
- a2a also ships an in-process deterministic provider for authoring runs. Its
  own documentation contrasts it with the tape-proxying mock: it runs entirely
  in-process, needs no container and no provider credential, and returns
  role-keyed content that the writers can propose and the reviewer can pass.
  Scripted determinism therefore has two candidate substrates, and the choice
  between them is a portability decision rather than a capability one.
- Scripted scenario content largely exists already as tapes covering tool
  failure, a human-in-the-loop pause, a loop case, an invalid case and the happy
  path. The scenario work is substrate selection and wiring rather than authoring
  behaviour from nothing.
- The owner has directed that a2a publish a consumable per-target binary and that
  the dashboard consume it. That producer does not yet publish, and one of its
  four targets currently builds and cannot start.

## Considered options

- **Place the end-to-end in the dashboard as a browser-driven project alongside
  the existing authoring lane, spawning both processes - chosen.** It reuses a
  proven spawn recipe, keeps the store suites free of a Python runtime
  dependency, and exercises the production attach path exactly as a user machine
  would.
- **Extend the existing unit-test live harness to spawn a2a - rejected.** That
  harness spawns one engine for a whole-suite run and is deliberately free of a
  Python dependency. Making every store suite depend on a Python runtime to prove
  one lane is a poor trade, and the degraded posture it proves is genuinely the
  honest state for store-level tests.
- **Have the engine spawn a2a for the test - rejected.** It would exercise a
  lifecycle that does not ship. The managed-start path is stubbed, so the test
  would prove a capability the product lacks while leaving the attach path, the
  one that does ship, unexercised.
- **Leave the proof to a2a's repository alone - rejected.** a2a proving its own
  runtime is necessary and is assigned below, but the dashboard's surface, relay,
  reducers and approval round trip are not testable from there.
- **Inject a fake model through the provider protocol for determinism -
  rejected.** That is precisely the substitution that hid the live defect. The
  double boundary must sit at the model, never at the factory or the transport.

## Constraints

- The double boundary is the model and nothing else. Gateway, worker process,
  dispatch transport, graph execution, checkpointer, event aggregation, lease and
  admission, and the authoring plane are real in every lane.
- Assertions are content equality against the script. A frame count, a connection
  success, or a non-empty transcript are transport proofs and are forbidden as
  the sole evidence for any capability.
- Every capability names the input that would turn it red BEFORE it is authored,
  and each lane demonstrates at least one real red at review time.
- Absence must be loud. The lane is environment-gated on an a2a substrate and
  reports a distinct skipped status; a vanished substrate must never be
  indistinguishable from a pass.
- The managed-path discovery record is out of scope until a producer exists. It
  is read by the dashboard and written by nobody on either side, so a test over it
  could not go red for the right reason.
- The stubbed lifecycle operations are asserted in their honest stub shape rather
  than skipped, so a future silent regression from honest refusal to fabricated
  success cannot pass.

## Implementation

**D1: The cross-repository end-to-end lives in the dashboard as ONE two-process
harness feeding TWO lanes.** a2a starts against a scratch application home; the
engine is pointed at that home and reached back through its own service record,
reproducing the production attach path. The harness owns both lifetimes and tears
both down. Above it sit two lanes: a wire lane asserting attach, streaming and
tool-call frames over HTTP and server-sent events plus the pure reducers, which
needs no browser; and a product lane driving a real browser only where the
browser IS the subject, namely the inline permission prompt, stop and retry, a
literal reload, and the proposal card. A browser test that could have been an
HTTP test is slower and flakier for no gain, and the transcript reducers are pure
by design precisely so they can be driven directly.

**D2: The test double is the model and only the model.** Determinism comes from
scripted models resolved through a2a's real provider factory. No lane may inject
the provider protocol, stub the worker, or fake the transport. A tape server
reached over loopback is still a model double and remains admissible, but the
in-process deterministic provider is preferred where it covers the scenario,
because a container dependency silently narrows the lane on the hosts least able
to run one. That preference is a portability judgement to be settled against the
actual fleet, not a correctness claim.

**D3: The a2a substrate is staged.** Stage one spawns a2a from pinned source
behind an environment gate. Stage two consumes the published per-target binary
once that producer exists, per the accepted consumption decision. Stage two is
blocked on one target by a startup defect and must not block stage one.

**D4: a2a owns proving its own runtime.** A real-worker run to a terminal state,
driven by a bundled mock preset through the production chain, lands as a
permanent live test in a2a. The dashboard end-to-end must never be the only test
capable of catching a regression that is purely a2a's.

**D5: Capabilities are sequenced by dependency and each carries its red-turning
input.** A run must execute before streaming can be asserted, streaming before
tool calls, tool calls before the approval round trip, and the approval loop
before the ledgered authoring loop that proves a product rather than a transport.
The sequence and its evidence obligations are the subject of the implementing
plan.

## Rationale

The decisive argument for placement is that the failure being closed is a
cross-process one, and the only honest way to close it is a harness that owns
both processes and drives the real user surface. Every alternative either proves
a capability the product does not ship, imposes a runtime dependency on suites
that are right to avoid it, or leaves the dashboard's own surface untested.

The decisive argument for the double boundary is empirical rather than
principled: the one seam every existing suite substituted is exactly where the
live defect sits. A model-only double is the narrowest substitution that still
yields determinism, and it keeps the entire production chain under test.

Sequencing by dependency is what makes the pathway falsifiable rather than
aspirational. The first capability is one that would be RED today, which is the
strongest available evidence that the sequence tests something real.

## Consequences

- A defect already surfaced by a single manual run, a worker resolving its
  effective model to a tuple, becomes the first thing the pathway proves fixed.
- The dashboard gains a lane requiring a Python runtime and an a2a checkout. It is
  environment-gated and loudly skipped rather than silently green, which makes its
  absence visible in the way a swallowed error was not.
- Six coordination asks fall to a2a: fix the model-resolution defect and land the
  real-worker run as a permanent test; add scripted scenario presets for tool
  calls, permission pauses, failure and cancellation; add a mock
  document-authoring preset so the ledgered loop is testable without provider
  credentials; extend provider-readiness agreement to dispatch-time resolution;
  fix the credential-publish defect that stops the frozen Windows runtime; and
  either write the managed-path discovery record or agree its field set is cut.
- The managed-path record and the stubbed lifecycle operations remain
  deliberately unproven, with the reason recorded, so their absence is a stated
  boundary rather than an oversight.
- Claims about a2a's internal readiness must be checked against the resident
  build's commit before being reported as defects. At least one observed
  inconsistency contradicts a green agreement test in that repository and may be
  a version skew rather than a regression.
