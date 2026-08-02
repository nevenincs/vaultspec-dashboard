---
tags:
  - '#exec'
  - '#a2a-integration-verification'
date: '2026-08-02'
modified: '2026-08-02'
body_schema: 'body-v1'
body_hash: 'sha256:bd3361aa596fcadefe9d8acddc15d39f67ac2e517157ad6eb5ff86b5c6c3df9e'
step_id: 'S10'
related:
  - "[[2026-07-31-a2a-integration-verification-plan]]"
---
# Assert the up-path pass-through with non-empty presets, an available agent tier and a run identity returned through the engine origin only

## Scope

- `frontend/e2e/agent/attach.spec.ts`
- `frontend/e2e/agent/harness.ts`
- `frontend/e2e/agent/gate.spec.ts`

## Description

- Add the real S10 Playwright slice over the owned engine and A2A process harness.
- Read the served active scope from the engine before issuing the generation-fenced run-start request.
- Assert a non-empty selectable deterministic preset, an available agent tier, and the exact returned run identity.
- Reuse the pinned A2A checkout environment with `uv run --no-sync` so the real lane does not construct a scratch environment during startup.
- Preserve bounded child diagnostics and caught cleanup causes for actionable real-lane failures.
- Narrow the substrate-gate value after its required skip so the whole frontend type gate remains sound.

## Outcome

S10 passed through the real engine-origin broker to a separately owned A2A gateway. Three consecutive fresh runs against the pinned engine and A2A worktrees returned a real run identity after the preset and tier assertions; every run left zero owned A2A and authoring scratch roots. Sol medium review approved the final code and evidence. Prettier, targeted ESLint, TypeScript, and diff checks passed. The agent gate is skipped when the source checkout is absent and passes when it is pinned.

## Notes

One earlier repeat run returned an engine 504 because the A2A listener stopped responding after healthy preflight. The lane surfaced that failure without retrying or weakening assertions. Three subsequent fresh runs passed, so this is retained as a reliability caveat for recurrence rather than hidden or treated as a pass.
