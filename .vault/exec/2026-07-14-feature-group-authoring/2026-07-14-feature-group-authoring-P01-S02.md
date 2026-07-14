---
tags:
  - '#exec'
  - '#feature-group-authoring'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S02'
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
     The S02 and 2026-07-14-feature-group-authoring-plan placeholders are machine-filled by
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
     The Author the feature-group panel frames: stage 1 select-or-create feature with pipeline coverage rows, stage 2 add-document with eligible types, pre-filled editable link chips, disabled-with-reason states, and the compact variant and ## Scope

- `Figma file SlhonORmySdoSMTQgDWw3w` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Author the feature-group panel frames: stage 1 select-or-create feature with pipeline coverage rows, stage 2 add-document with eligible types, pre-filled editable link chips, disabled-with-reason states, and the compact variant

## Scope

- `Figma file SlhonORmySdoSMTQgDWw3w`

## Description

- Author `_CreateDocDialog/CoverageRow` set (`State=Present|Missing|Next`): DocTypeMark + type label + newest-stem text + status; Next rides the accent-soft fill with a "Next step" tag.
- Author `_CreateDocDialog/TypeOption` set (`State=Selected|Eligible|Disabled`): mark + plain-language title + hint line; Disabled at 0.55 opacity with the prerequisite reason as the hint.
- Author `_CreateDocDialog/LinkChip`: sunken pill, stem text + remove glyph.
- Build `Stage=Feature`: title "Add to a feature", corpus combobox, "IN THIS FEATURE" coverage card (research present, decision record next, rest missing), Cancel/Continue kit buttons.
- Build `Stage=Document`: back glyph + "Add a document" + feature chip header, eligibility-gated type list (plan disabled with reason, audit eligible with open-a-pipeline hint), title input, pre-filled "Linked documents" chip row, Cancel/Create.
- Combine as the canonical `CreateDocDialog` variant set; archive the flat dialog as `_archived/CreateDocDialog.flat` so the name-join stays unique.
- Author state previews `CreateDocDialog.newFeature` (free-text tag, empty-pipeline note) and `CreateDocDialog.compact` (320w).
- Update the frame inventory (`frontend/figma/FRAMES.md`) with all new node ids.

## Outcome

Frames verified by screenshot at scale 1: coverage rows, gated types, chips, and both state previews render clean; geometry hug-correct after two fixes.

## Notes

Two authoring defects caught and fixed in-session: the LinkChip component scaffolded at a fixed 100px height (set to hug both axes), and the two state-preview clones landed as COMPONENT nodes (converted to plain frames via instance-detach so the component list stays clean). User approval of the frames (S03) gates P04.
