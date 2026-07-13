---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-07-12'
step_id: 'S20'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

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
