---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S07'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace figma-parity-reconciliation with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S07 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
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
     The Adopt Inter and JetBrains Mono as the bound font families, replacing the system stack and ## Scope

- `frontend/src/styles.css` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
