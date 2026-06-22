---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S07'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---




# Adopt Inter and JetBrains Mono as the bound font families, replacing the system stack

## Scope

- `frontend/src/styles.css`

## Description

- Adopted Inter as the bound sans family and JetBrains Mono as the bound mono family, replacing the prior system stack, by loading both webfonts at the top of the stylesheet with a swap display strategy.
- Bound the generated foundation font families (which front Inter and JetBrains Mono with the prior stack as a fallback tail) to the Tailwind font namespace so the font utilities adopt the bound faces.
- Kept the prior system stack as the fallback tail in both family tokens so the app stays legible before the webfonts load and when offline.

## Outcome

The dashboard now binds Inter and JetBrains Mono as its identity faces, matching the binding Figma type layer, with the fallback stack ensuring immediate legible render and graceful offline degradation. The Tailwind font-sans and font-mono utilities resolve to the bound families through the generated foundation tokens.

## Notes

The webfont declaration lives in the stylesheet as a font import with display swap; the prior in-code rationale for a system-only stack is superseded by the ADR, which binds Inter and JetBrains Mono. The stylesheet edits for this step (the font import plus the Tailwind font binding) are co-located in the single stylesheet file and therefore shipped in the S05 commit that regenerated and re-formatted that file; this record and the plan checkbox close the step. The import is render-friendly (swap) and the fallback chain keeps the offline path warm; if a future hardening prefers self-hosted faces, that is a bundling change outside this phase's token scope.
