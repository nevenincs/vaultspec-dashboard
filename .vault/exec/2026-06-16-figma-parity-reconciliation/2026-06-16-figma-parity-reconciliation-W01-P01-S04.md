---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S04'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

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
