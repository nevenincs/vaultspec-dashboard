---
tags:
  - '#exec'
  - '#rag-service-management'
date: '2026-06-26'
modified: '2026-07-12'
step_id: 'S15'
related:
  - "[[2026-06-26-rag-service-management-plan]]"
---

# Render the per-tenant data-management section as ActionDescriptors driving reindex, clean rebuild, evict, and watcher

## Scope

- `frontend/src/app/right/RagOpsConsole.tsx`

## Description

- Add the `Tenants` section: the resident project registry from `ops-state.tenants` (slot basename, ref-count, idle) with a per-slot Evict (`useRagProjectEvict`, disabled unless idle/ref 0) and the `slots of max · idle-TTL` line.
- Add the `DataManagement` section: Reindex vault / Reindex code / Clean rebuild (via `useRagReindexWithProgress.trigger`) and Watcher on/off (`useRagWatcherStart`/`Stop`), with a live reindex ProgressBar + phase readout.

## Outcome

Done. The per-tenant data-management surface is rendered as ActionDescriptor-dispatched controls (reindex/clean/evict/watcher all flow the ops seam) over the W02 backend, degrading via the tiers block. Gate-clean (tsc/eslint/prettier/lint:px).

## Notes

Reindex/clean reuse the existing `useRagReindexWithProgress` (job trigger-then-poll, bounded backoff); the console adds the vault/code/clean trigger surface and the watcher toggle. Tenant slot eviction is gated to idle slots (`ref_count === 0`) mirroring rag's own eviction rule.
