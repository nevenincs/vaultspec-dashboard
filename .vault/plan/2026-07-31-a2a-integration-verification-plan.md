---
tags:
  - '#plan'
  - '#a2a-integration-verification'
date: '2026-07-31'
modified: '2026-07-31'
body_hash: 'sha256:3c9ea61bf4e26bab20e8b2ce5dc8230bb62603080075c0a8e398269dddc11ff4'
tier: L3
related:
  - '[[2026-07-31-a2a-integration-verification-adr]]'
  - '[[2026-07-31-a2a-integration-verification-verification-surface-inventory-reference]]'
---

# `a2a-integration-verification` plan

## Description

## Steps

## Wave `W01` - a2a mock-lane truth: make a run COMPLETE and lock it

Nothing downstream is testable until a run executes to a terminal state through the real model chain. This wave is RED today, lands directly in the a2a repository, and is the only work on the critical path from the first day.

### Phase `W01.P01` - root-cause and fix the model resolution defect

Name the seam that yields a tuple, fix it at the producer rather than defending at the consumer, and lock it with a regression test that resolves every bundled preset through the real provider factory.

- [ ] `W01.P01.S01` - Instrument one real-worker dispatch of a bundled mock preset to log the effective model type after each of the four wrapping seams and record which seam yields the tuple, red today against current code; `src/vaultspec_a2a/graph/nodes/worker.py`.
- [ ] `W01.P01.S02` - Fix the model-resolution defect at the seam the instrumentation names, repairing the producer rather than adding a defensive type check at the consumer; `src/vaultspec_a2a/graph/nodes/worker.py`.
- [ ] `W01.P01.S03` - Add a regression test resolving every bundled preset worker model through the REAL provider factory with no protocol injection and asserting a chat-model instance each time, red if the tuple is reintroduced; `src/vaultspec_a2a/graph/tests/test_compiler.py`.

### Phase `W01.P02` - the completion proof

Land the permanent proof that a mock run reaches a terminal completed state through the real gateway and worker. Shaped by a discriminator step, so the destination file is decided rather than assumed.

- [ ] `W01.P02.S04` - Settle where the completion proof runs by checking whether the deterministic service-test stack is container-gated on the current fleet and whether its tests are among the capsule-gated set that passes without executing, delivering a written verdict; `src/vaultspec_a2a/service_tests/`.
- [ ] `W01.P02.S05` - Land the permanent completion proof driving a bundled mock run to a completed terminal state through the real gateway and real worker with run history carrying the scripted message content, red today on the tuple defect and red if an absent substrate is silently tolerated; `src/vaultspec_a2a/acceptance/tests/`.

### Phase `W01.P03` - the scenario substrate

Choose between the container-backed tape server and the in-process deterministic provider on portability across the fleet, then deliver the four scripted scenarios the wire and product ladders consume.

- [ ] `W01.P03.S06` - Choose the scenario substrate between the container-backed tape server and the in-process deterministic provider, judged on availability across all four self-hosted targets, and record the decision with its portability rationale; `src/vaultspec_a2a/providers/`.
- [ ] `W01.P03.S07` - Deliver the four scripted scenarios covering a tool call, a permission pause, a failure and a cancel window on the chosen substrate, reusing existing tape content where it already covers the behaviour; `src/vaultspec_a2a/team/presets/mock/`.

## Wave `W02` - dashboard harness and the wire ladder: attach, streaming, tool calls

One two-process harness feeding the wire lane, asserted over HTTP and server-sent events plus the pure reducers with no browser. Harness authoring starts in parallel with the a2a wave, and only its green depends on that wave.

### Phase `W02.P04` - the two-process harness

Reproduce the manual cold-run recipe mechanically, owning both process lifetimes, behind an environment gate whose absence is a distinct skipped status rather than a pass.

- [ ] `W02.P04.S08` - Author the two-process harness spawning a2a against a scratch application home and the engine against a scratch worktree, wired both directions through their real discovery records and owning both teardowns, reading the existing authoring harness whole first; `frontend/e2e/agent/harness.ts`.
- [ ] `W02.P04.S09` - Wire the environment-gated agent lane into its own playwright configuration reporting a distinct skipped status when the substrate is absent, red if unsetting the gate yields a pass rather than a skip; `frontend/dev/playwright.agent.config.ts`.

### Phase `W02.P05` - attach and the degraded flip

Prove the up-path pass-through through the engine origin only, and prove the same reads flip to degraded-with-reason when a2a stops. A tier read that cannot flip proves nothing.

- [ ] `W02.P05.S10` - Assert the up-path pass-through with non-empty presets, an available agent tier and a run identity returned through the engine origin only; `frontend/e2e/agent/attach.spec.ts`.
- [ ] `W02.P05.S11` - Assert the degraded flip by stopping a2a mid-suite and re-reading the same verbs for degraded-with-reason tiers, red if a tier read cannot flip; `frontend/e2e/agent/attach.spec.ts`.

### Phase `W02.P06` - streaming through the relay

Assert relayed frame content equals the script with a monotonic sequence, that a stale cursor yields an explicit gap, and that the pure reducers reduce captured frames to the scripted transcript.

- [ ] `W02.P06.S12` - Assert relay streaming content equality where the relayed frames of one completed mock run equal the scripted text under a monotonic engine sequence, red if the relay opens and serves zero frames while the run completes; `frontend/e2e/agent/stream.spec.ts`.
- [ ] `W02.P06.S13` - Assert that a reconnect with a stale cursor yields an explicit gap frame and that killing a2a mid-stream yields a degraded relay rather than silence; `frontend/e2e/agent/stream.spec.ts`.
- [ ] `W02.P06.S14` - Feed the captured live frames through the pure relay adapter and transcript reducer asserting the reduced transcript equals the script, red if a frame class is silently dropped by the classifier; `frontend/e2e/agent/stream.spec.ts`.

### Phase `W02.P07` - tool-call frames

Assert the scripted tool call arrives as frames and reduces to one record carrying the scripted arguments and result.

- [ ] `W02.P07.S15` - Assert the scripted tool call relays content-equal and reduces to one tool record carrying the scripted arguments and result, red if frames classify but the record is absent; `frontend/e2e/agent/toolcalls.spec.ts`.

## Wave `W03` - the browser product ladder: approval, stop and retry, reload recovery

A real browser only where the browser is the subject. These three phases are mutually parallel once streaming lands, and each proves a product behaviour rather than a transport.

### Phase `W03.P08` - the approval loop in the browser

Drive the inline permission prompt end to end. Allow resumes exactly once, and deny must leave the scripted tool unexecuted rather than merely rendering a denial.

- [ ] `W03.P08.S16` - Drive the permission loop in the browser so the inline prompt appears on the permission scenario and allow resumes the run with the scripted tool outcome landing in the transcript; `frontend/e2e/agent/approval.spec.ts`.
- [ ] `W03.P08.S17` - Assert the deny path leaves the scripted tool unexecuted with the denial rendered and that a double allow resumes exactly once, red on deny-still-executes or a double resume; `frontend/e2e/agent/approval.spec.ts`.

### Phase `W03.P09` - stop and retry in the browser

Prove stop reaches a cancelled status read from run-status truth, and that retry mints a new run identity rather than replaying the old one.

- [ ] `W03.P09.S18` - Drive stop and retry in the browser so stop reaches a cancelled status read from run-status truth and retry mints a new run identity, red if retry silently replays the old run; `frontend/e2e/agent/stopretry.spec.ts`.

### Phase `W03.P10` - reload recovery

Prove a mid-run reload restores the binding through active-runs discovery and resumes the relay, and that an ambiguous discovery result refuses to bind.

- [ ] `W03.P10.S19` - Drive reload recovery so a mid-run browser reload restores the binding through active-runs discovery and resumes the relay; `frontend/e2e/agent/recovery.spec.ts`.
- [ ] `W03.P10.S20` - Assert the ambiguity refusals where two active runs or a truncated discovery result leaves the binding empty, red if an ambiguous result binds; `frontend/e2e/agent/recovery.spec.ts`.

## Wave `W04` - ledgered product proof and coordination closeout

The summit is a document existing in the ledger because an agent proposed it and a human approved it in the UI. Closeout carries the honest-boundary assertions and the non-blocking cross-repository asks.

### Phase `W04.P11` - authoring preset wiring

Wire a document-authoring preset onto the existing in-process deterministic provider so an engine-started authoring run needs no container and no provider credential.

- [ ] `W04.P11.S21` - Wire a document-authoring preset onto the existing in-process deterministic research and adr provider so an engine-started authoring run needs no container and no provider credential; `src/vaultspec_a2a/team/presets/`.

### Phase `W04.P12` - the ledgered authoring loop

The summit. A deterministic authoring run proposes a document through the authoring plane, the card renders it, approve applies it, and the applied document is read back from the ledger over the wire.

- [ ] `W04.P12.S22` - Drive the ledgered authoring loop in the browser so a deterministic authoring run proposes a document through the authoring plane, the card renders it and approve applies it, evidenced by reading the applied document back as a ledger record over the wire rather than by a UI assertion alone; `frontend/e2e/agent/authoring.spec.ts`.
- [ ] `W04.P12.S23` - Assert a request-changes verdict loops the phase gate into a revision cycle ending in a second reviewable proposal; `frontend/e2e/agent/authoring.spec.ts`.

### Phase `W04.P13` - honest boundaries

Assert the stubbed lifecycle operations in their honest refusal shape from the live lane, so a regression from honest stub to fabricated success cannot pass unnoticed.

- [ ] `W04.P13.S24` - Assert the eight stubbed lifecycle operations in their honest refusal shape with a failed state and the pending-effect reason from the live lane rather than skipping them, red if a stub regresses to fabricated success; `frontend/src/stores/server/a2aLifecycle.live.test.ts`.

### Phase `W04.P14` - coordination closeout

The non-blocking cross-repository asks: the readiness-disagreement verdict, the frozen Windows credential publish, the manage-path record decision, and published-binary substrate resolution.

- [ ] `W04.P14.S25` - Determine whether the provider-readiness disagreement is version skew by comparing the resident a2a commit against the agreement test landing commit, then extend agreement to dispatch-time resolution or record the skew; `src/vaultspec_a2a/api/tests/test_gateway_live.py`.
- [ ] `W04.P14.S26` - Fix the frozen Windows runtime credential publish that fails on a file-sharing violation during startup, unblocking the published-binary substrate on one target; `src/vaultspec_a2a/lifecycle/discovery.py`.
- [ ] `W04.P14.S27` - Decide producer-or-cut for the manage-path gateway discovery record so that either a2a writes it or the dashboard reader field set is cut, requiring an owner decision before any edit; `engine/crates/vaultspec-product/src/discovery.rs`.
- [ ] `W04.P14.S28` - Teach the harness substrate resolution to prefer the published per-target a2a binary when present while keeping the source spawn as fallback, blocked externally on the publisher; `frontend/e2e/agent/harness.ts`.

### Phase `W04.P15` - the closing gate

Demonstrate one real red per lane at review and wire the agent lane into the quality gates with its skip status visible.

- [ ] `W04.P15.S29` - Demonstrate one real red per lane at review by killing a2a, denying a permission and truncating discovery, recording each in the closing audit; `frontend/e2e/agent/`.
- [ ] `W04.P15.S30` - Wire the agent lane into the quality gates with its distinct skip status visible so a vanished substrate is never indistinguishable from a pass; `.github/workflows/quality-gates.yml`.

## Parallelization

## Verification
