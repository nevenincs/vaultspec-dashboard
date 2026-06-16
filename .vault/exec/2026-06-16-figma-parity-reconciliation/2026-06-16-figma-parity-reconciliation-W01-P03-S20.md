---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S20'
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
     The S20 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
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
     The Author or update the Code Connect config naming the live file and the connect directory and ## Scope

- `frontend/figma.config.json` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Author or update the Code Connect config naming the live file and the connect directory

## Scope

- `frontend/figma.config.json`

## Description

- Confirm `figma.config.json` declares the React parser under the `codeConnect` key with the `React` label.
- Confirm the `include` globs cover both the connect directory (`figma/connect/**/*.figma.tsx`) and the app source (`src/app/**/*.tsx`) so source paths resolve, with `node_modules`, `dist`, `spike`, and `e2e` excluded.
- Confirm the `documentUrlSubstitutions` map points `<MIRROR>` and `<GRAPH>` at the live file `SlhonORmySdoSMTQgDWw3w`, so every `*.figma.tsx` node-url substitution resolves against the live design file.

## Outcome

The Code Connect config is finalized: the CLI discovers it during `figma connect parse` ("Config file found, parsing ... using specified include globs"), the substitution tokens resolve every parsed node-url to the live file, and the connect directory plus app source are both in scope. The config is the CLI entry point that the S21 mappings and the S22 parse validation both rely on.

## Notes

The config was authored by the prior repoint and validated clean on inspection and via the parse run; no edit was required this phase. The PAT-bearing publish step that reads this config stays the human's gated action and was not run.
