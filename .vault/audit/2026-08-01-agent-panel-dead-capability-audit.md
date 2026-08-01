---
tags:
  - '#audit'
  - '#agent-panel'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
related:
  - '[[2026-08-01-a2a-agent-flow-adr]]'
  - '[[2026-07-14-a2a-orchestration-edge-adr]]'
---
# `agent-panel` audit: `dead capability`

## Scope

Durable capture of two findings from the agent-flow implementation audit
(2026-08-01, both repos, read-only), recorded here rather than in a scratch
file because both adjudicate decisions of `2026-08-01-a2a-agent-flow-adr` and
must be findable from that record's feature index. Both findings are one
failure class with two faces: a component that is unit-green but never wired,
and a rule that existed only as prose, with no enforcement mechanism.

## Findings

### d5-clarification-dead-capability | high | D5 shipped as dead capability across two repos: every part built, no producer ever injected

The mid-run clarification surface decided in `2026-08-01-a2a-agent-flow-adr`
D5 was implemented end to end — a2a interrupt node, checkpoint-projected
`run-status` disclosure, respond service, engine pass-through verb and
boundary validation, relay frame kind, and the panel questionnaire — and every
part was unit-green in isolation. Yet no graph stage ever injected a
clarification producer into the node, and the `clarification-pending` frame
emitter had zero callers: the panel could render a questionnaire that no run
would ever raise. The capability was dead on arrival while every component
test passed, because nothing proved the producing seam — the tests exercised
each part below the wiring, and no stitched test drove
interrupt → disclosure → respond → resume as one loop (the gap D8(c) of the
parent record names).

### kimi-profile-admission-violation | high | a served kimi profile violated the parent record's own admission rule

`2026-08-01-a2a-agent-flow-adr` D3 rules that only providers with a live
COMPLETED-TURN test may appear in a served profile, and records kimi as
handshake-only (its live test deliberately reaps the subprocess before any
prompt — no agent work, no spend). A kimi lane was nonetheless served in a
profile of the research preset because handshake coverage was mistaken for
proof. The rule had no enforcement mechanism: the a2a eligibility service
(`src/vaultspec_a2a/providers/model_profiles.py`) gates on credential
readiness and harness verification, and encodes no proven-turn admission term
— so nothing served-side could distinguish a proven lane from a merely
credentialed one, and the admission rule lived only in the ADR's prose.

## Recommendations

- Both findings are enforcement gaps, and both are now codified as team rules
  per the parent record's own codification candidates:
  `clarifications-are-typed-interrupts` (a2a repo — extended with an explicit
  wiring clause: a raisable surface must have a producer injected and a
  stitched loop test; an emitter with zero callers is a defect) and
  `no-unproven-providers-in-served-profiles` (a2a repo — extended to require
  the proven/unproven distinction be ENCODED in the served eligibility
  service, not left as convention). `served-presets-are-the-router` lands in
  this repo in the same pass.
- Follow-on work the rules imply, owned by the a2a lane: an admission term in
  the eligibility service that consumes completed-turn proof, so an unproven
  lane is served ineligible with a reason; the D8(c) stitched clarification
  loop test as the standing wiring proof.
- Capture choice, stated: these findings live in THIS audit record (the
  findings artifact class), not in the parent ADR's consequences — the ADR
  records decisions and their anticipated costs; evidence of how the
  implementation deviated belongs to the audit trail, linked so the feature
  index and the parent's backlink graph surface it.
