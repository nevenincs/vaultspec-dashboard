---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S14'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---

# Define separate UI and code type-scale tokens, mandate tabular numerals on data-bearing contexts, and reserve monospace for identity/code with no bundled identity face

## Scope

- `frontend/src/styles.css`

## Description

- Define separate UI and code type-scale token families: a compact instrument-grade UI scale (preserved from the prior file) and a distinct code/buffer scale.
- Declare the system/variable UI sans and a dedicated system monospace as font tokens, with no bundled identity face for a web-served tool.
- Mandate tabular numerals on data-bearing contexts via a base rule on time and data-tabular elements (font-variant-numeric: tabular-nums), reserving monospace for true identity and code.

## Outcome

The UI and code scales are tracked as separate token families (ADR layer 5). Tabular numerals are enforced at the token/base-rule level for timestamps, counts, and the tiers block; monospace is reserved for hashes, byte spans, provenance keys, and paths.

## Notes

Surfaces still need to opt into mono and tabular at the call site in the surface waves; this step establishes the tokens and the data-bearing base rule, not the per-surface application.
