---
tags:
  - '#exec'
  - '#rag-service-management'
date: '2026-06-26'
modified: '2026-06-26'
step_id: 'S06'
related:
  - "[[2026-06-26-rag-service-management-plan]]"
---

# Make the stores start action conditional and carry attach semantics

## Scope

- `frontend/src/stores/server/opsActions.ts`

## Description

- Add the typed `RagStartOutcome` + `interpretRagStartEnvelope` interpreter reading the engine's lifecycle envelope (`status` already_running/started/machine_owned/failed/unknown, `attached`, `reason`, `output`, `pid`, `port`); every status but failed/unknown is `attached: true`.
- Add `useRagServiceStart(scope)` / `useRagServiceStop(scope)` mutation hooks that dispatch through the one ops seam and, on success, re-read the authoritative state via the existing `invalidateAfterRagOpsRun` (status + rag-control + scoped semantic reads) - the attach re-read.

## Outcome

Done. The stores layer now carries attach semantics: a start no longer throws on already-running (the engine returns a 200 attach envelope), the result is interpreted into a typed outcome, and the dashboard re-reads `/status` (now reporting the attached running service). `npx tsc --noEmit` is exit 0.

## Notes

The "conditional" offering (show start only when rag is not running) is a UI concern consumed via the already-exposed running state (`deriveRagStatusView.running` / `isRagRunning`); these hooks are the typed seam the W04 console will use. The existing command-palette start/stop dispatch sites are untouched and still work (the engine change made them attach-correct).
