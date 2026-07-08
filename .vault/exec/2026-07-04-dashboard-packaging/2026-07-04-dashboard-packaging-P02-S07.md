---
tags:
  - '#exec'
  - '#dashboard-packaging'
date: '2026-07-04'
modified: '2026-07-04'
step_id: 'S07'
related:
  - "[[2026-07-04-dashboard-packaging-plan]]"
---

# probe vaultspec-core capability and the 0.1.36 floor at serve startup reusing the existing runner resolution and emit the exact uv tool install remediation

## Scope

- `engine/crates/vaultspec-api/src/lib.rs`

## Description

- Add `probe_core` to the handshake module: rides `ingest_core::runner::core_version()`, which probes the SAME invocation the memoized runner resolution brokers, so the handshake reports the core the engine actually uses
- Declare `CORE_FLOOR` 0.1.36 (the pyproject runtime pin); an ABSENT core fails the startup gate with the exact `uv tool install vaultspec-core` command, while a present-but-below-floor core passes the gate and degrades through the D6 handshake instead

## Outcome

Unit tests cover the exact-remediation message for a missing core and the below-floor-passes-the-gate distinction (0.1.34 passes startup, fails the floor; 0.1.36 meets it). Shared verification evidence in the S08 record.

## Notes

- The absent-vs-stale split is deliberate: presence is the hard startup requirement; the floor verdict rides tiers so an old core degrades authoring rather than refusing the whole dashboard.
