---
generated: true
tags:
  - '#index'
  - '#a2a-orchestration-edge'
date: '2026-07-19'
modified: '2026-07-19'
related:
  - '[[2026-07-14-a2a-orchestration-edge-adr]]'
  - '[[2026-07-14-a2a-orchestration-edge-reference]]'
  - '[[2026-07-14-a2a-orchestration-edge-research]]'
  - '[[2026-07-17-a2a-orchestration-edge-P01-S01]]'
  - '[[2026-07-17-a2a-orchestration-edge-P01-S02]]'
  - '[[2026-07-17-a2a-orchestration-edge-P02-S03]]'
  - '[[2026-07-17-a2a-orchestration-edge-P02-S04]]'
  - '[[2026-07-17-a2a-orchestration-edge-P02-S05]]'
  - '[[2026-07-17-a2a-orchestration-edge-P03-S06]]'
  - '[[2026-07-17-a2a-orchestration-edge-P03-S07]]'
  - '[[2026-07-17-a2a-orchestration-edge-P03-S08]]'
  - '[[2026-07-17-a2a-orchestration-edge-P04-S09]]'
  - '[[2026-07-17-a2a-orchestration-edge-P04-S10]]'
  - '[[2026-07-17-a2a-orchestration-edge-P04-S11]]'
  - '[[2026-07-17-a2a-orchestration-edge-P04-S12]]'
  - '[[2026-07-17-a2a-orchestration-edge-P04-S14]]'
  - '[[2026-07-17-a2a-orchestration-edge-P06-S15]]'
  - '[[2026-07-17-a2a-orchestration-edge-P06-S16]]'
  - '[[2026-07-17-a2a-orchestration-edge-P06-summary]]'
  - '[[2026-07-17-a2a-orchestration-edge-audit]]'
  - '[[2026-07-17-a2a-orchestration-edge-plan]]'
  - '[[2026-07-19-a2a-orchestration-edge-active-run-recovery-audit]]'
  - '[[2026-07-19-a2a-orchestration-edge-adversarial-performance-security-audit]]'
---

# `a2a-orchestration-edge` feature index

Auto-generated index of all documents tagged with `#a2a-orchestration-edge`.

## Documents

### adr

- `2026-07-14-a2a-orchestration-edge-adr` - `a2a-orchestration-edge` adr: `the stable cross-repo surface between the dashboard engine and the revived A2A orchestrator` | (**status:** `accepted`)

### audit

- `2026-07-17-a2a-orchestration-edge-audit` - `a2a-orchestration-edge` audit: `reconciliation`
- `2026-07-19-a2a-orchestration-edge-active-run-recovery-audit` - `a2a-orchestration-edge` audit: `active-run reload recovery`
- `2026-07-19-a2a-orchestration-edge-adversarial-performance-security-audit` - `a2a-orchestration-edge` audit: `adversarial performance, conformance, and security review`

### exec

- `2026-07-17-a2a-orchestration-edge-P01-S01` - Emit a run.completed lifecycle event and transition RunStatus to Completed at the run-settle seam
- `2026-07-17-a2a-orchestration-edge-P01-S02` - Consume run.completed in the frontend lifecycle adapter with terminal-aware invalidation and render the Done turn status from the wire, with live-wire tests
- `2026-07-17-a2a-orchestration-edge-P02-S03` - Build the ops a2a verb namespace on the rag ops template forwarding the five whitelisted verbs to the a2a v1 gateway with bounded arg validation, verbatim sibling envelope inside the tiers envelope, degraded-tier 200 on sibling-down, 502 on crash or timeout, and attach-never-own discovery
- `2026-07-17-a2a-orchestration-edge-P02-S04` - Provision per-role actors and engine-minted tokens at run-start and inject the ActorTokenBundle into the forwarded payload, never logging token values
- `2026-07-17-a2a-orchestration-edge-P02-S05` - Write guard tests mirroring the rag ops suite plus a live loopback test against a real a2a gateway covering whitelist miss, degraded sibling, crash, and verbatim envelope pass-through
- `2026-07-17-a2a-orchestration-edge-P03-S06` - Add a versioned run stream verb under the v1 a2a gateway re-serving the bounded SSE progress frames on the public surface, with live tests, in the vaultspec-a2a repository
- `2026-07-17-a2a-orchestration-edge-P03-S07` - Relay the a2a run stream as a new engine SSE channel feeding bounded versioned frames into the shared ring with seq and gap semantics and honest degradation to run-status polling
- `2026-07-17-a2a-orchestration-edge-P03-S08` - Prove the relay live end to end including replay from since, gap emission on eviction and lag, and the oversized-frame drop sentinel passing through unaltered
- `2026-07-17-a2a-orchestration-edge-P04-S09` - [SCHEMA NOTE from agent-wire-gaps lead: the feedback_batches table itself lands via agent-wire-gaps P01.S01 as part of ONE additive schema-version bump (queue state + provenance cols + batch table) — build the snapshot backend ON that table and do NOT author a second migration for it. Any shape change ships as a FRESH version bump.] Build the immutable feedback-batch snapshot backend per feedback-loop D3 with stable identifier, digest, ordered comment bodies, anchors, author identity, source revision, session identity, and creation time, plus its creation route
- `2026-07-17-a2a-orchestration-edge-P04-S10` - Add the typed feedback_batch_id field to StartPromptTurnRequest and verify ownership, revision fences, limits, and idempotency when a turn consumes a batch
- `2026-07-17-a2a-orchestration-edge-P04-S11` - Thread feedback_batch_id through a2a run-start and turn dispatch as an opaque identifier whose authoritative context is retrieved via the engine authoring client, in the vaultspec-a2a repository
- `2026-07-17-a2a-orchestration-edge-P04-S12` - Switch the composer comment batch from serialized prompt prose to the structured feedback_batch_id continuation and delete the prose interim outright
- `2026-07-17-a2a-orchestration-edge-P04-S14` - Ingest the retrieved feedback batch in the a2a worker flow: a feedback-aware step that reads the batch via the authoring client when feedback_batch_id is present in graph state and grounds the document revision on it, compiled into the worker graph, with live tests, in the vaultspec-a2a repository
- `2026-07-17-a2a-orchestration-edge-P06-S15` - Add the engine-scoped active-run discovery verb with fixed two-result upstream bound, optional bounded feature filter, and real-loopback contract coverage
- `2026-07-17-a2a-orchestration-edge-P06-S16` - Recover the team-run viewing binding only from one complete active workspace result, clear cross-scope bindings, and keep run-status plus relay authoritative
- `2026-07-17-a2a-orchestration-edge-P06-summary` - `a2a-orchestration-edge` `P06` summary

### plan

- `2026-07-17-a2a-orchestration-edge-plan` - `a2a-orchestration-edge` plan

### reference

- `2026-07-14-a2a-orchestration-edge-reference` - `a2a-orchestration-edge` reference: `dev-team brief for the vaultspec-a2a revival`

### research

- `2026-07-14-a2a-orchestration-edge-research` - `a2a-orchestration-edge` research: `the stable dashboard surface the legacy A2A orchestrator builds against`
