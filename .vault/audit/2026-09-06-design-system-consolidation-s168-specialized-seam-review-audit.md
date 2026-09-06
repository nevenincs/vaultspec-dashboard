---
tags:
  - '#audit'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:d430d116b52bd1be40bc9547bfa0d1c1eab6b708af80c94c65ae4f05421c4fb6'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
  - "[[2026-09-05-design-system-consolidation-adr]]"
  - "[[2026-09-05-design-system-consolidation-horizontal-polish-research]]"
  - "[[2026-09-05-design-system-consolidation-shipped-frontend-blueprint-reference]]"
---
# `design-system-consolidation` audit: `S168 specialized native seam classification review`

## Scope

Review the ten S168 specialized search, composer-entry, provider-select, task-checkbox, native-date, and code-overlay classifications against the accepted behavior freeze, live component contracts, stable identities, nearest kit analogues, the syntax-aware baseline, and the adjacent S165 and S169 ownership boundaries.

## Findings

### s168-specialized-seam-review | low | specialized native seams pass migration challenge

All ten entries are uniquely keyed `retain-semantic-seam` decisions with concrete distinctions: one prompt textarea is an auto-growing command and mention combobox; one provider select is generated from served controls and revision-validated opaque options; four palette inputs are structurally integrated header comboboxes; one step checkbox is the roving tab stop and optimistic mutation seam for its row; two native date inputs preserve locale-aware picker behavior and linked corpus bounds; and one transparent code textarea synchronizes selection, formatting keys, two-axis scroll, syntax layers, and diff gutters.

None should migrate to the current `SearchField`, planned ordinary `TextField` or `TextArea`, or `Segment`. `SearchField` forwards useful combobox attributes but imposes its own bordered, rounded, sunken wrapper, leading glyph, and optional clear action, which would alter the palette headers and duplicate their existing chrome. The ordinary field contracts do not own native date pickers, served dynamic selects, command-entry modes, task mutations, or renderer-coordinated editor layers. `Segment` models a bounded controlled radiogroup rather than opaque provider-native options.

The global syntax-aware baseline remains 125 executable sites: 100 buttons, 19 inputs, five textareas, and one select. The ledger has 54 unique keys and exactly ten S168 entries comprising seven inputs, two textareas, and one select. The properties metadata date remains the earlier ordinary `TextField` migration because it is a text input with a numeric keyboard hint, not a native date picker. The non-checkbox renderer fallback in `COMPONENTS.input` remains absent from the ledger for S169 renderer-coordination review rather than being mislabeled as the task checkbox. Focused AST, ownership, uniqueness, cardinality, and target-only `git diff --check` checks passed; the independent full frontend lint recipe completed with exit zero.

## Recommendations

Accept S168 as classified. Keep each retained native element inside its named canonical composite, and do not widen ordinary kit primitives with palette, provider, task, date-picker, or code-editor mechanics. Preserve the renderer fallback for S169 adjudication.

Status: PASS.
