---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S01'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

# Author the DTCG type-scale source with the Figma role names display, title, body, body-strong, label, meta, caption, and mono

## Scope

- `frontend/tokens/type.tokens.json`

## Description

- Authored a new W3C DTCG type source under the tokens directory carrying the binding Figma role-named scale: display, title, body, body-strong, label, meta, caption, and mono.
- Each role declares a fontSize dimension, a lineHeight dimension, and the bound fontWeight; sizes and line-heights are the binding Foundations/Type and Metrics values from the parity research (display 20/28, title 15/22, label 12/16, meta 11/14, mono 11; body 13/20; caption 10/14).
- Bound the two font families in the same source: a sans family fronted by Inter and a mono family fronted by JetBrains Mono, each retaining the prior system stack as a fallback tail.
- Recorded in the source description that these emit as the canonical text and font foundation tokens and that the legacy names remain deprecated aliases until the view rewrite cuts usages over.

## Outcome

The type taxonomy is now authored as DTCG, faithful to the binding Figma role names and metrics. It is consumed by the generator extension in S05 and the Figma mirror extension in S06. The size/line-height/weight split keeps each role addressable as separate custom properties for Tailwind utility generation.

## Notes

The title role intentionally maps to the legacy 15px heading metric, not the legacy 13px section-label, so the downstream collision guard (S10) can keep the legacy 13px section-label bound to the new body-strong role rather than mis-binding it to the 15px title. body-strong shares body metrics at the bound medium weight, covering the legacy 13px-plus-medium section-label use without introducing a new size.
