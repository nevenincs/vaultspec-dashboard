---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S22'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---




# Validate the full Code Connect map parses with zero errors via figma connect parse, leaving publish as the human's gated step

## Scope

- `frontend/figma/connect/`

## Description

- Run `npx figma connect parse --skip-update-check --exit-on-unreadable-files` from `frontend/`.
- Confirm the command exits 0, enumerates all 13 connect files, and emits one parsed entry per component with no error, warning, unreadable-file, or `404` line.
- Confirm every parsed `figmaNode` resolves to the live file `SlhonORmySdoSMTQgDWw3w` and none to the retired seed file `8WDmXNOURdRQwdefWNGsBb`.
- Hold the publish: `figma connect publish` is the human's PAT-gated step and was not run.

## Outcome

The parse validates clean: exit code 0, 13 top-level parsed entries, zero error or unreadable-file lines, and every node-url resolved against the live design file. The Code Connect map is publish-ready. The full frontend lint gate (`just dev lint frontend`) also exits 0 with `figma:registry` OK.

Parse result (component to node-url):

- `WorkTab` -> `SlhonORmySdoSMTQgDWw3w?node-id=137-40`
- `TreeBrowser` -> `SlhonORmySdoSMTQgDWw3w?node-id=161-164`
- `Timeline` -> `SlhonORmySdoSMTQgDWw3w?node-id=239-713`
- `TextControl` -> `SlhonORmySdoSMTQgDWw3w?node-id=136-30`
- `SwitchControl` -> `SlhonORmySdoSMTQgDWw3w?node-id=137-28`
- `RailTabs` -> `SlhonORmySdoSMTQgDWw3w?node-id=244-753`
- `NumberControl` -> `SlhonORmySdoSMTQgDWw3w?node-id=155-96`
- `LeftRail` -> `SlhonORmySdoSMTQgDWw3w?node-id=244-750`
- `HoverCard` -> `SlhonORmySdoSMTQgDWw3w?node-id=137-4`
- `FacetChipGroup` -> `SlhonORmySdoSMTQgDWw3w?node-id=136-27`
- `EnumControl` -> `SlhonORmySdoSMTQgDWw3w?node-id=137-31`
- `ContextMenuHost` -> `SlhonORmySdoSMTQgDWw3w?node-id=157-120`
- `CodeTree` -> `SlhonORmySdoSMTQgDWw3w?node-id=158-126`

## Notes

Publish is deliberately held - it is the human's gated one-command step (plan S66 in W04.P11) and requires the PAT in the gitignored `frontend/.env`, which was left untouched and not printed. The parse output bundles the `@figma/code-connect` template runtime as serialized strings; the word "error" appears only inside that embedded helper code, not as a parse diagnostic, which was confirmed by decoding the JSON array and checking every entry resolves clean.
