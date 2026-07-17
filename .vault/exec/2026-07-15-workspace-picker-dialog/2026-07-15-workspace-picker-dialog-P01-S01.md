---
tags:
  - '#exec'
  - '#workspace-picker-dialog'
date: '2026-07-15'
modified: '2026-07-17'
step_id: 'S01'
related:
  - "[[2026-07-15-workspace-picker-dialog-plan]]"
---

# Author the picker dialog Figma frames in the binding file covering default, selection, filter, hidden-shown, error, truncated, degraded, and first-run states at desktop and compact widths, from Kit atoms and tokens with node names equal to the React exports

## Scope

- `figma:SlhonORmySdoSMTQgDWw3w`

## Description

- Inspect the binding file inventory and confirm no existing picker frames; note the parallel campaign's in-flight `[Exploration] Agentic document workspace` frame and place new work clear of it
- Read the file's conventions: Semantic variable tier (surface, border, ink, accent, status), Scale spacing and radius tokens, shared text styles (Inter and JetBrains Mono ramps)
- Create the `[Surface] Workspace Picker` top-level frame (node 1173:4503) at a clear canvas position
- Build the master `AddProjectDialog/selection` dialog (720 wide): header, unified monospace path field, places rail (Home, drives, Projects, Recent), breadcrumb bar, filter row with hidden toggle, select-then-confirm folder list with Git repository / Project / Already added badges, footer with helper text plus Cancel and named-confirm primary button
- Clone into state frames: default (no selection, confirm falls back to the current folder), filter active with match count, hidden-shown with de-emphasized dotfolder rows, error (typed refusal copy band), truncated (stated 256 cap note), degraded (unreadable folder with typed-path escape hatch)
- Author the compact variant (360 wide, places rail collapsed to a chip row) and the first-run context annotation
- Bind every fill and ink to Semantic variables and every text run to shared styles; screenshots verified per milestone

## Outcome

The `[Surface] Workspace Picker` frame holds nine on-system artifacts: eight desktop dialog states plus the compact variant, all composed from bound variables and shared text styles, node names matching the React exports (`AddProjectDialog`, with the browser pane and places rail named for their components). This closes the ADR D7 design-first gate; the frames are the binding visual contract for Phase P03.

## Notes

- Two clone defects were caught and fixed in-session: a title text edit that hit the wrong node in the default state, and the compact variant's browser pane collapsing to zero height (FILL sizing inside a hug parent).
- The kit `Dialog` component in the file is a bare stub; the Control Panels surface was used as the visual precedent instead.
