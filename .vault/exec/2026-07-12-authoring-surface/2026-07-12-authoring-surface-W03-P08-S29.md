---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S29'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# Mirror the new affordances into the binding design file or record the deliberate divergence

## Scope

- `FRAMES.md`

## Description

- Located the binding design catalogue at `frontend/figma/FRAMES.md` (Figma file `SlhonORmySdoSMTQgDWw3w`).
- Determined that all new affordances from the authoring-surface epic (D1–D6) are code-only additions with no corresponding Figma nodes yet; Figma API edits were not attempted per standing instructions.
- Added a "Pending design-sync — authoring-surface epic" section to `frontend/figma/FRAMES.md` recording: two Figma components to retire (Inspector `635:3126` and DocHeader `283:1170`), and eight new affordances with enough detail for a designer to mirror them (plan-step checkbox rows, heading comment affordance and count chip, comment thread panel, editor diff toggle and diff section, accelerator hints on View/Edit toggle, workspace-ghost New-document button, browser-region Plus button, Features-section scoped Plus, and the corpus-fed feature combobox in the create dialog). Each entry names the suggested Figma home.

## Outcome

`frontend/figma/FRAMES.md` updated with a self-contained "Pending design-sync" section. No Figma API calls were made; the divergence is recorded in-file per the design-system ADR's permitted divergence clause. A designer can work through the listed entries to bring the binding file current.

## Notes

The step targeted `FRAMES.md` at the repo root, but the file lives at `frontend/figma/FRAMES.md`. The catalogue format was read before authoring; the pending-sync entries follow the same tabular and prose conventions as the rest of the file. NowStrip had no standalone Figma component node and was noted inline rather than as a retire entry.
