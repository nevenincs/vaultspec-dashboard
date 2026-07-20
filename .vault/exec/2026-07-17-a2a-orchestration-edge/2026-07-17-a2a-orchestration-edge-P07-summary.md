---
tags:
  - '#exec'
  - '#a2a-orchestration-edge'
date: '2026-07-19'
modified: '2026-07-20'
related:
  - '[[2026-07-17-a2a-orchestration-edge-plan]]'
---

# `a2a-orchestration-edge` `P07` summary

P07 hardened the full active-run reload path and closed the adversarial audit gate.

- Modified: sibling gateway auth, discovery handoff, configuration, run-start reservation, run-id validation, active-run persistence/query, migrations, and live/performance tests.
- Modified: dashboard A2A broker, actor-token lifecycle, relay/parser budgets, product discovery trust, frontend stream/query/recovery ownership, and focused tests.
- Modified: current A2A reference, plan, audit queue, sibling desktop architecture surfaces, and P07 execution records.
- Created: dialect and credential-separation proofs, the shared progress coordinator, P07 S17-S23 execution records, and this phase summary.

## Description

The sibling now exposes authenticated loopback-only bounded active-run discovery with portable indexed selectors, one path-safe identifier grammar, durable pre-dispatch reservation, and secret-free owner-restricted credential handoff. Gateway and worker credentials are non-interchangeable by configuration and production HTTP proof.

The dashboard broker keeps synchronous work off Tokio, bounds actor tokens and relay memory, records sequence loss under saturation, and retries an ambiguous lost acknowledgement exactly once without revoking authority prematurely. The frontend reconnects after pre-terminal EOF, completes after terminal EOF, retains only 256 frames and 2 MiB, and stores reconciliation generation outside the evictable presentation array under one mounted coordinator.

The 2026-07-20 follow-up retired the full cross-repository lost-ack proof and
test-harness shell warning. A stronger in-flight response-loss scenario now
boots the production dashboard, authenticated gateway, gateway-owned worker,
real provider lane, and real stores; exact replay produces one run and dispatch,
an altered replay is refused, and the minted role token performs a real
authoring mutation.

The final contract review initially returned revision-required. The resulting
repair makes prepare a hard readiness gate, registers every authorized role
actor, binds prepare and commit to canonical request digests, linearizes commit
and release per stable run, validates the complete committed response before
local activation, and makes pre-commit hashes inert with bounded maintenance.
Frontend subprocess, fetch, setup-failure, POSIX process-group, socket, and log
bounds are closed. The rolling audit retains only medium cross-repository CI
coordination and decomposition of four unrelated product-provisioning modules;
the reviewed A2A modules remain below the 1,500-line gate.
