---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S16'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# Extract the single probe-and-provision module so the startup WARN gate, the served provision projection, and the CLI all consume one source of component floors, probes, and remediation strings

## Scope

- `engine/crates/vaultspec-api/src/provisioning/`

## Description

- Add the one-shot CLI facade to `engine/crates/vaultspec-api/src/routes/provision.rs`: `cli_status` (drives the same `provision_status` handler with a registry-resolved target) and `cli_run` (deserializes through the SAME wire DTO grammar, starts the job via `provision_run`, and polls `provision_job` to a terminal state bounded by the job ceiling plus slack).
- The startup gate already consumes `handshake` (same floors/remediation); the projection and the CLI now share the handlers themselves — one module, three consumers.

## Outcome

Terminal, boot log, and GUI provisioning truth are single-sourced by construction.

## Notes

cli_run returns the full served envelope so the CLI reuses the plane's own tiers block.
