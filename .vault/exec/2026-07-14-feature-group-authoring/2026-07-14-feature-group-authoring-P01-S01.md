---
tags:
  - '#exec'
  - '#feature-group-authoring'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S01'
related:
  - "[[2026-07-14-feature-group-authoring-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace feature-group-authoring with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S01 and 2026-07-14-feature-group-authoring-plan placeholders are machine-filled by
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
     The Audit the Kit atoms and existing dialog frames the panel composes, and inventory the panel's required states (feature select, coverage rows, eligible and disabled types, link chips, errors, compact) and ## Scope

- `Figma file SlhonORmySdoSMTQgDWw3w` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Audit the Kit atoms and existing dialog frames the panel composes, and inventory the panel's required states (feature select, coverage rows, eligible and disabled types, link chips, errors, compact)

## Scope

- `Figma file SlhonORmySdoSMTQgDWw3w`

## Description

- Resolve the binding-file structure from the frame inventory (`frontend/figma/FRAMES.md`): single Components page, `[Surface] Authoring` board, name-as-contract join.
- Inspect the existing flat dialog component (the clone base) node-by-node: shell 336w/r10/white + rule stroke, field idiom (11px label, paper input r5), suggestion list, kit Button footer.
- Extract the bound palette from live paints: paper, white, rule, ink, muted, label, accent, accent-soft; Inter Regular/Medium/Semi Bold at 9-14px.
- Inventory reusable atoms: `DocTypeMark` set (Category x Tone) maps one-to-one onto pipeline coverage rows; kit `Button` main components reused for footers.
- Inventory required states: feature select-or-create, per-feature coverage rows (present/missing/next), eligible/selected/disabled-with-reason type options, editable link chips, new-feature empty pipeline, compact width.

## Outcome

Complete audit; no gaps in the kit blocked the panel (no new primitive needed beyond the three `_CreateDocDialog/*` sub-components authored in S02).

## Notes

The desktop app had the marketing-site file open; reads were routed through the plugin bridge against the binding file key instead of the selection-based metadata tools.
