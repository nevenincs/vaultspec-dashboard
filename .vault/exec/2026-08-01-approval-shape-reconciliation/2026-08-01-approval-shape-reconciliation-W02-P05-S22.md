---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:29cddf986579608c9a9db05f09d1dba3af3980decf05d360526d719f73d8344f'
step_id: 'S22'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# Remove the session_override and session_override_ignored fields from the PolicyDecisionProjection wire type

## Scope

- `frontend/src/stores/server/authoring/wireTypes.ts`

## Description

- Remove the `session_override` and `session_override_ignored` fields from the served `PolicyDecisionProjection` wire type, matching the engine's stripped `PolicyDecisionProjection` struct (D5).

## Outcome

`PolicyDecisionProjection` carries only `policy_version`, `scope_mode`, `effective_mode`, `risk`, `requirement`, `reason` — no client-visible trace of the rescinded session-override layer remains in the wire type.

## Notes
