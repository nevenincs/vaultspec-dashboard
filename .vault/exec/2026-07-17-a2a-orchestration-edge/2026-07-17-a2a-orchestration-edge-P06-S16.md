---
tags:
  - '#exec'
  - '#a2a-orchestration-edge'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S16'
related:
  - "[[2026-07-17-a2a-orchestration-edge-plan]]"
---

# Recover the team-run viewing binding only from one complete active workspace result, clear cross-scope bindings, and keep run-status plus relay authoritative

## Scope

- `frontend/src/stores/server/agent/a2aTeam.ts`
- `frontend/src/stores/view/agentPanel.ts`
- `frontend/src/app/agent/AgentPanel.tsx`

## Description

- Fail closed unless the complete bounded v1 active-run projection is valid.
- Select a recovery binding only for one non-truncated result and key the finite cache by served scope.
- Track the binding's owning scope, clear cross-scope bindings, and omit the unavailable prompt after reload.
- Scope-gate transcript and relay rendering synchronously and consume a successful discovery snapshot after binding.
- Mount discovery only for the visible transcript and hand the recovered id to existing authoritative status and relay hooks.
- Cover unique, zero, ambiguous, truncated, malformed, degraded live-wire, and scope-change behavior.

## Outcome

The Agent panel can recover one unambiguous active team run after reload without persisting client authority, accepting contract drift, crossing scopes, or resurrecting consumed results. Focused frontend verification passed 37 tests, TypeScript, Prettier, and ESLint.

## Notes

The live render suite emitted existing shutdown-time socket reset diagnostics after all tests passed. No mock, fake, skip, or xfail was introduced.
