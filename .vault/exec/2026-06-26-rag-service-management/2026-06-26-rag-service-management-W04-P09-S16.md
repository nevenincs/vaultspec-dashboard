---
tags:
  - '#exec'
  - '#rag-service-management'
date: '2026-06-26'
modified: '2026-07-12'
step_id: 'S16'
related:
  - "[[2026-06-26-rag-service-management-plan]]"
---

# Render the diagnostics section for size, jobs, storage survey, orphans, and quality, and mount the console into the chrome

## Scope

- `frontend/src/app/right/RagOpsConsole.tsx`

## Description

- Add the `IndexAndSize` (counts, points, humanized disk footprint, GPU, Qdrant, live/orphaned namespaces - orphaned tinted broken), `Jobs` (recent reindex activity + phase), and `Diagnostics` (Tier-2 collection health for the first live `_vault_docs` namespace via `useRagCollectionHealth` - status pill, segments, indexed-vs-total; degrading honestly when `supported:false`) sections.
- Mount the console: register the `rag-ops` `StatusSectionId` (union + `STATUS_SECTION_IDS`) and render `<RagOpsConsoleBody />` as a collapsed-by-default `RAG OPS` `SectionCard` in `StatusTab`, enrolled in the rail's FocusZone via `headerNav("rag-ops")`.

## Outcome

Done. The full operations console renders as a machine-level `RAG OPS` section in the activity rail, distinct from the per-scope git/plan sections, showing the lifecycle strip + a degraded placeholder when rag is down and the full size/state/data/jobs/diagnostics surface when running. Frontend gate clean: `npx tsc --noEmit` exit 0, eslint 0, prettier formatted, `lint:px` clean. W04 (console build) complete.

## Notes

The console mounts inside the single `StatusTab` rail (tabs were retired) as a distinct collapsible section with machine-level copy - the realistic placement for the ADR D7 "dedicated host-level surface" given the rail structure. It is rendered within the `populated` rail state for consistency with the sibling sections; surfacing it across all rail states (so a corpus-empty workspace still shows the machine console) and a live-engine render test are noted follow-ups for the W05 review. The Diagnostics collection name is sourced from the storage survey (never recomputed from rag's internal blake2b), honoring the Tier-2 contract.
