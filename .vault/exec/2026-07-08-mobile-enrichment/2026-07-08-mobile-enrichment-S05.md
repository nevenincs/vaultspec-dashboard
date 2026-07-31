---
tags:
  - '#exec'
  - '#mobile-enrichment'
date: '2026-07-09'
modified: '2026-07-09'
body_hash: 'sha256:9a83ccc69edaec8da38e3624ccbd09f617a58dae78a7b289a983c5eed23c339b'
step_id: 'S05'
related:
  - "[[2026-07-08-mobile-enrichment-plan]]"
---

# Add a live-engine compact guard test asserting the ADR-status word and date render inline (the tooltip-only regression is otherwise silent)

## Scope

- `frontend/src/app/left/VaultBrowser.compact.render.test.tsx`

## Description

- Add a live-engine render test that stubs `matchMedia` to force the compact viewport class, renders the vault browser against the real fixture wire, and asserts the ADR acceptance WORD + authored date render inline (not tooltip-only) and the plan progress renders inline.

## Outcome

Passes against the live engine; the desktop rail render tests remain green (9/9). The tooltip-only regression is now guarded.

## Notes
