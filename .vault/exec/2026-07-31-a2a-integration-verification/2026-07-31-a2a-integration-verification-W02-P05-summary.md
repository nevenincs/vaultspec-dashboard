---
tags:
  - '#exec'
  - '#a2a-integration-verification'
date: '2026-08-02'
modified: '2026-08-02'
body_schema: 'body-v1'
body_hash: 'sha256:cd632fc507f1001ed5e4c10240c3c1687bbe62b7133f84b07fd811b58a1e1705'
related:
  - "[[2026-07-31-a2a-integration-verification-plan]]"
---
# `a2a-integration-verification` `P05` summary

The attach and degraded-flip phase is complete. It proves the real engine attaches to an owned A2A gateway, returns a live deterministic run identity, then reports the same pass-through as degraded after the owned gateway stops.

- Modified: `frontend/e2e/agent/attach.spec.ts`
- Modified: `frontend/e2e/agent/harness.ts`
- Modified: `frontend/e2e/agent/gate.spec.ts`
- Created: the S10 and S11 execution records

## Description

S10 reads the served session scope, discovers a selectable deterministic preset, verifies the available agent tier, and starts a real run through the engine origin. S11 then stops only the owned A2A process and re-reads the pass-through, requiring HTTP 200, a null envelope, an unavailable tier, and a nonempty served reason. The harness now uses the isolated A2A environment with `uv run --no-sync`, exposes bounded child diagnostics, and retains cleanup causes.

Verification included Sol medium review for both steps, Prettier, targeted ESLint, TypeScript, the environment gate in both absent and pinned states, and repeated real two-process execution. One earlier S10 504 is retained in its step record as a loud reliability caveat; three later fresh S10 passes and the final S10/S11 lane passed with no owned-root residue.
