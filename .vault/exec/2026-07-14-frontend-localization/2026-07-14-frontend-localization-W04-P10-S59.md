---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S59'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Replace search-service lifecycle and indexing internals with user-facing setup, progress, and recovery copy

## Scope

- `frontend/src/app/panels/RagJobDashboard.tsx`
- `frontend/src/app/panels/RagJobsTable.tsx`
- `frontend/src/app/panels/RagDashboardFooter.tsx`
- `frontend/src/stores/server/ragDashboardView.ts`
- `frontend/src/stores/view/ragDashboard.ts`

## Description

- The step's original scope, `frontend/src/app/right/RagOpsConsole.tsx`, no
  longer exists — it was deleted and split into the five files above as part
  of the 2026-07-14 rag job-dashboard campaign, predating this reconciliation
  pass.
- Swept the five successor files for the three scanner-blind defect classes
  found elsewhere in this campaign (raw-English default parameters on
  accessible-name props, hardcoded `Record<..., string>` label maps, and
  internal-service vocabulary — `rag`/`vector`/`embedding`/`qdrant` — rendered
  as visible text): none found. Ran the bounded localization scanner against
  all five files: zero exact findings.
- Ran the five files' own live test suites (`RagJobDashboard.render.test.tsx`,
  `RagJobsTable.test.tsx`, `RagDashboardFooter.test.tsx`,
  `ragDashboardView.test.ts`, `ragDashboard.test.ts`): 37/37 passed.

## Outcome

The rag job-dashboard surface — the successor to the step's original scope —
carries no unlocalized copy or internal-service vocabulary in visible text; no
code change was required.

## Notes

Verified by opus-l10n (no code change), independently reverified by me:
confirmed the scanner-blind classes by direct grep (raw default label params,
hardcoded label-map `Record` types, visible internal-service vocabulary) in
addition to the scanner run, and reran all five test files live myself —
37/37 passed. Rescoped from the deleted `RagOpsConsole.tsx` to its five
successor files (see the note above); this record supersedes the step's
literal plan-text scope with the current module layout.
