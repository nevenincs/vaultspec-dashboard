---
tags:
  - '#exec'
  - '#feature-group-authoring'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S02'
related:
  - "[[2026-07-14-feature-group-authoring-plan]]"
---

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
