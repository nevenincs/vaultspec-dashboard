---
tags:
  - '#audit'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:f29a41c79a1d32fbf7c27d2a90a6e1a0d73aea566d3ecf7b29e82e827f855e2c'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
  - "[[2026-09-05-design-system-consolidation-horizontal-polish-research]]"
  - "[[2026-09-05-design-system-consolidation-shipped-frontend-blueprint-reference]]"
---

# `design-system-consolidation` audit: `S164 executable-control baseline decision`

## Scope

Adjudicate whether the native-control baseline should count raw textual matches or only
executable JSX controls after the first classification pass found two matches in source
comments.

## Findings

### textual-false-positives | high | resolved non-executable matches in the baseline

The dated raw search returns 128 matches, but two occur only in documentation prose: one
`input` reference in `FacetRow` and one `button` reference in `Tab`. Treating either as a
control would make the ledger factually false and teach the later scanner to count
comments. Delegated decision authority approved 126 executable JSX controls as the
canonical baseline: 100 buttons, 20 inputs, one select, and five textareas. Twelve are
owned by the kit and 114 are outside it. The raw 128-match result remains documented as
provenance rather than ledger data.

### third-textual-false-positive | high | resolved corrected executable baseline

A syntax-aware verification found a third prose-only match: the date-input example in
`FilterMenu`. The earlier 126-site ruling is superseded. Delegated decision authority
approved the exhaustive AST result as canonical: 125 executable JSX sites comprising
100 buttons, 19 inputs, one select, and five textareas. Twelve are kit-owned and 113 are
outside the kit; the stage area contains 14. All three prose matches remain only in the
dated raw-search provenance.

### implementation-review | low | passed independent review

An independent `gpt-5.6-sol` reviewer verified the corrected research totals, both
delegated baseline decisions and their supersession, the 16-entry bounded ledger, and
the S164 family boundary. The re-review returned `PASS` with no remaining findings after
the stale stage, `FilterMenu`, and prose-match facts were corrected.

## Recommendations

Use an executable-source scan for completeness checks and exclude comments structurally.
Do not create ledger identities for the three prose matches. Preserve all existing plan
identifiers while correcting only the affected baseline statement and verification row.

Status: APPROVED AS CORRECTED at 125 executable JSX sites.
