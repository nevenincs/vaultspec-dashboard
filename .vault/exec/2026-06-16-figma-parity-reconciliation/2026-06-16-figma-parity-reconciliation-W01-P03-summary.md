---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

# `figma-parity-reconciliation` `W01.P03` summary

Phase W01.P03 finalized the Code Connect linkage from code components to the live Figma Kit primitives so the full map parses with zero errors and is publish-ready for the human's gated publish step. All four Steps (S19 to S22) are closed. The phase verified and recorded a prior repoint to the live design file rather than authoring the bindings fresh, so the registry, the config, and the mappings required no mutation; the work was parse-clean validation.

- Verified: `frontend/figma/component-map.json` (the component registry, repointed to the live file) (S19)
- Verified: `frontend/figma.config.json` (the Code Connect config) (S20)
- Verified: `frontend/figma/connect/` (the 13 `*.figma.tsx` Kit-primitive mappings and the full-map parse) (S21, S22)

## Description

S19 confirmed the component registry is repointed to the live design file `SlhonORmySdoSMTQgDWw3w` (the retired seed file appears nowhere) with 13 design-surface components bound to Kit primitives under frame `135:2`, and validated the registry against its schema and the source-drift gate via `npm run figma:registry` (OK, 58 components mapped, 13/51 design surfaces bound to live nodes). S20 confirmed the Code Connect config declares the React parser, includes both the connect directory and the app source, and resolves its `<MIRROR>`/`<GRAPH>` substitution tokens to the live file.

S21 confirmed the 13 `*.figma.tsx` mappings each import the real `src/app/` component and call `figma.connect` with a node id matching the registry binding and a valid example supplying the required props. S22 ran `figma connect parse` from `frontend/`: it exits 0, enumerates all 13 connect files, emits one parsed entry per component (CodeTree, ContextMenuHost, EnumControl, FacetChipGroup, HoverCard, LeftRail, NumberControl, RailTabs, SwitchControl, TextControl, Timeline, TreeBrowser, WorkTab) with no error or unreadable-file line, and resolves every node-url against the live file. Publish was deliberately held as the human's PAT-gated W04.P11 step and was not run.

## Verification

The Code Connect map parses with zero errors (exit 0, 13 entries, every node-url on the live file), and the full frontend lint gate (`just dev lint frontend`) exits 0 with `figma:registry` OK. The phase shipped as commit `f56ee2b`; the figma-code-connect-via-cli rule was subsequently codified in `537ebfb` alongside the code-connect devDep. Wave W01 was reviewed PASS with no CRITICAL or HIGH findings.

## Carried forward

The dominant carry-forward: only 13 of 51 design surfaces are bound; the remaining 38 surfaces are intentionally left unbound (`figmaNodeId: null`, no `*.figma.tsx` mapping, which the validator accepts) because they have no standalone Kit primitive under frame `135:2` to map against. Binding those 38 surfaces awaits the W02 chrome and W03 canvas rewrites that build the surfaces against the designs. The PAT-gated `figma connect publish` is held as the operator's one-command W04.P11.S66 step and was not run; the parse is the publish-ready precondition this phase delivered.
