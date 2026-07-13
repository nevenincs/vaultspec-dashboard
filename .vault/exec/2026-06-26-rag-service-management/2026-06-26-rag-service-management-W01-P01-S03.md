---
tags:
  - '#exec'
  - '#rag-service-management'
date: '2026-06-26'
modified: '2026-07-12'
step_id: 'S03'
related:
  - "[[2026-06-26-rag-service-management-plan]]"
---

# Surface running, crashed, and absent rag state through the stores adapters

## Scope

- `frontend/src/stores/server/liveAdapters.ts`

## Description

- Extend the `EngineStatus.rag` type with `reason?: string` and document `service` as the now-richer lifecycle word (running/crashed/absent).
- Source `adaptStatus`'s rag lifecycle word from the live `/status` machine `state` (running/crashed/absent), falling back to the available-flag word (running/stopped) for samples carrying no `state`, and forward the wire `reason`.

## Outcome

Done. The stores layer now surfaces the crashed-vs-absent distinction to the app layer through `rag.service` + `rag.reason`, while `isRagRunning` still gates on exactly `running` and the tiers-derived degradation reason (`deriveRagStatusView`) is untouched (kept reading from tiers per `degradation-is-read-from-tiers`). `npx tsc --noEmit` is exit 0.

## Notes

The existing `adaptStatus` unit assertion expecting `service === "stopped"` is preserved by the fallback (its synthetic sample carries no `state`). The lifecycle `service` word and the tiers-derived semantic degradation are complementary: `service` drives the lifecycle control (attach-vs-start), the tiers reason drives semantic degradation copy.
