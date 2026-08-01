---
tags:
  - '#plan'
  - '#advanced-service-console'
date: '2026-08-01'
modified: '2026-08-01'
body_hash: 'sha256:e86acad03e7dd53823ab335cc3ee7acbf86daf0c47201800c743740c85f4f70a'
tier: L1
related:
  - '[[2026-08-01-advanced-service-console-adr]]'
  - '[[2026-08-01-advanced-service-console-research]]'
---

# `advanced-service-console` plan

- [x] `S01` - Add the Advanced section frame to the settings dialog, rendered after the schema-driven groups, with the palette command Open service console; `frontend/src/app/settings`.
- [x] `S02` - Redesign and relocate the rag console as the service-named TUI pair: identity header (name, version, host:port, pid, storage path), normal-sized lifecycle controls, jobs with existing filters, log tail, storage summary, all over the codified contract reads; `frontend/src/app/settings, frontend/src/app/panels`.
- [x] `S03` - Relocate the A2A lifecycle panel as a dev subsection under Advanced and add the compact engine-status block from existing status reads; `frontend/src/app/settings, frontend/src/app/panels`.
- [x] `S04` - Remove FrameworkStatusCluster and its ControlPanels plumbing from user chrome in the same change, keep a minimal user-facing approvals affordance, and re-point palette commands; `frontend/src/app/right, frontend/src/app/AppShell.tsx, frontend/src/stores/view`.
- [x] `S05` - Update guards, desk specimens for the moved surfaces, and run the full frontend gate plus touched-scope vitest green; `frontend/dev/visual-review/specimens, frontend/src`.
## Description

## Steps

## Parallelization

## Verification
