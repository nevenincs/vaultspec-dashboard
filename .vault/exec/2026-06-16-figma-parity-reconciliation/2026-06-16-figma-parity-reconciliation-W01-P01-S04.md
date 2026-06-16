---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S04'
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
     The S04 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
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
     The Author the DTCG spacing source mirroring the existing 4-base scale to bring spacing under the generated pipeline and ## Scope

- `frontend/tokens/spacing.tokens.json` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Author the DTCG spacing source mirroring the existing 4-base scale to bring spacing under the generated pipeline

## Scope

- `frontend/tokens/spacing.tokens.json`

## Description

- Authored a new DTCG spacing source under the tokens directory mirroring the existing 4-base scale: 2, 4, 6, 8, 12, 16, 24, 32 px.
- Each step is a dimension token in rem with a px description; the values are unchanged from the prior hand-authored spacing tokens.
- Recorded that the research found spacing already matches the Figma binding, so this step brings the existing scale under the generated pipeline for mechanical parity rather than changing any value.

## Outcome

The spacing taxonomy is now under the generated non-color pipeline with identical values, so its Figma parity is mechanical rather than hand-policed going forward. Consumed by the generator and Figma mirror extensions; the legacy spacing names alias the generated tokens during the alias window.

## Notes

No value change: this is a parity-preserving promotion of an already-matching family. The research verdict for spacing was MATCH; the only gap it named was the missing generator, which this source closes together with the S05 build extension.
