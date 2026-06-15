---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S13'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-pipeline-status with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S13 and 2026-06-14-dashboard-pipeline-status-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Serve the bounded plan-container interior from the mock engine for a plan node, emitting the PlanInterior envelope with rolled-up completion, per-step checked flags, headings, exec-record bindings, and the truncated block when the fixture exceeds the ceiling and ## Scope

- `frontend/src/testing/mockEngine.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Serve the bounded plan-container interior from the mock engine for a plan node, emitting the PlanInterior envelope with rolled-up completion, per-step checked flags, headings, exec-record bindings, and the truncated block when the fixture exceeds the ceiling

## Scope

- `frontend/src/testing/mockEngine.ts`

## Description

- Verified the mock serves `/nodes/{id}/plan-interior` with rolled-up steps, per-step `done`, headings, and exec bindings; added a `setPlanInteriorTruncated` seam so the mock emits the live `truncated` block, exercising honest truncation through the real client path.

## Outcome

The interior mock exercises both the bounded tree and the capped-tree truncation state.

## Notes

Satisfied by the sibling `dashboard-pipeline-wire` plan; verified the deliverable exists and is consumed by this plan's surface. The truncation seam is this plan's addition over the wire mock.
