---
tags:
  - '#exec'
  - '#mobile-enrichment'
date: '2026-07-09'
modified: '2026-07-09'
step_id: 'S06'
related:
  - "[[2026-07-08-mobile-enrichment-plan]]"
---

# Verify: full frontend lint gate green, live @390px visual parity against the binding Figma frames, and code review closeout

## Scope

- `frontend/`

## Description

- Run the full `just dev lint frontend` gate (eslint, px-scan, prettier, tsc, tokens, figma:names).
- Drive the live app at a 390px viewport and compare each compact surface to its binding Figma frame.
- Dispatch the read-only code-review gate over the committed change.

## Outcome

Full gate green; live @390px parity confirmed against the consolidated `[Mobile] Compact` frames; code-review gate dispatched (findings recorded in the feature audit).

## Notes
