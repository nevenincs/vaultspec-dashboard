---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:405fb239b1d58c8513515202136ae5bc0aaa8a220fdb5591db0a07e1105891ea'
step_id: 'S23'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# Remove the session_override and session_override_ignored mapping lines from the policy decision adapter

## Scope

- `frontend/src/stores/server/authoring/adapters.ts`

## Description

- Remove the `session_override` and `session_override_ignored` mapping lines from `adaptPolicyDecision` in the policy decision adapter, matching the stripped wire type.

## Outcome

`adaptPolicyDecision` maps only the six remaining served fields; `asBool` remains imported (still used by `adaptEligibility`/`adaptProposalProjection` elsewhere in the file).

## Notes
