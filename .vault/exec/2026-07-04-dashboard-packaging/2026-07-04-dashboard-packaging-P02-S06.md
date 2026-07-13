---
tags:
  - '#exec'
  - '#dashboard-packaging'
date: '2026-07-04'
modified: '2026-07-12'
step_id: 'S06'
related:
  - "[[2026-07-04-dashboard-packaging-plan]]"
---

# probe git presence at serve startup with a bounded git version run and fail closed with plain remediation prose

## Scope

- `engine/crates/vaultspec-api/src/lib.rs`

## Description

- Add the `handshake` module with `probe_git`: a bounded `git --version` run (64 KiB stdout cap plus 30 s wall-clock deadline, the worker-thread pattern the ingest-core capability probe uses) memoized per process
- Call `handshake::startup_gate()` in `serve()` immediately after the `.vault` corpus check, before any heavy state build, so a missing git aborts startup with plain remediation prose naming git-scm.com

## Outcome

Unit tests cover the missing-binary probe path (spawn failure reports absence) and the gate's fail-closed message. Implemented together with S07/S08 as one handshake module; the shared verification evidence lives in the S08 record.

## Notes

- S06 through S08 landed as one commit (one cohesive module) rather than one commit per step; recorded here per step for traceability.
- AMENDED after CI (2026-07-07): the fail-closed exit broke the adversarial degradation suite and the conformance harness, both of which run serve without core by design; the probe now WARNS with the same remediation and serves degraded, honoring the binding tiers doctrine. The gate function and its tests are unchanged; only serve's handling softened. Recorded as a D3 amendment on the packaging ADR.
