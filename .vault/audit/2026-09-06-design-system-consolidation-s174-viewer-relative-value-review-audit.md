---
tags:
  - '#audit'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:79fc89b3d6c61381dd314d33d962444c978e32e9fda7f94e11ff07617096914d'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
  - "[[2026-09-05-design-system-consolidation-adr]]"
  - "[[2026-09-05-design-system-consolidation-horizontal-polish-research]]"
  - "[[2026-09-05-design-system-consolidation-shipped-frontend-blueprint-reference]]"
---

# `design-system-consolidation` audit: `S174 viewer relative-value classification review`

## Scope

Reviewed exact Step `W01.P01.S174`: every raw relative-value line-site under `app/viewer` and `app/authoring`, the 24 appended viewer ledger identities, complete compound expressions and units, dispositions, canonical owners, and rationale fields against the accepted behavior-preserving consolidation decision and live source. Later value families and unrelated dirty graph and scene work remained outside scope.

The independent raw scan reproduced exactly 106 production app/platform line-sites, exactly 24 disjoint viewer line-sites, and zero authoring line-sites. The accepted prefixes remain S172 at 18 and S173 at 14; the accumulated ledger imports as 56 entries. S174 has 24 unique collision-safe source identities and the exact split of 14 `migrate`, nine `retain-exact-geometry`, and one `repair-local-defect`. Every qualifying line's compound expression is complete, including reader responsive insets, code-marker geometry, and `CommentThreadPanel`'s `max-h-[24rem] max-w-[calc(100cqw-1.5rem)]` bound.

The focused `consolidation-ledger.test.ts` suite passed three of three tests. Independent `just lint frontend` exited 0 across ESLint, localization, relative-unit, domain, module-size, formatting, typecheck, token-drift, and Figma-name checks; `git diff --check` passed for the ledger and audit.

## Findings

### s174-viewer-relative-value-classification | low | The viewer slice is exhaustive, value-preserving, and correctly owned

No corrective finding surfaced. Existing foundation type roles are exact matches, while the shared coarse-target, code-header gap, reader cluster, inset, gutter, chip, and link metrics have concrete component reuse and preserve their shipped values without nearby-token substitution. The nine retained entries are renderer, marker, embedded-container, or asymmetric chrome geometry whose numerical coincidence with spacing values does not create foundation semantics. `[...selected, stem]` is correctly preserved as the dated raw-baseline false positive and assigned to the future syntax-aware scanner repair without authorizing viewer behavior changes.

Adding `cqw` to `RELATIVE_VALUE_UNITS` is necessary and narrowly grounded: `CommentThreadPanel` is the only production source using that unit, and its qualifying line combines `calc(100cqw - 1.5rem)` with a rem height cap. Omitting `cqw` would make the recorded expression's unit vocabulary incomplete. Scoped status shows no S174 production viewer, authoring, or scene edit.

## Recommendations

- Preserve every compound expression as a single reviewed line-site identity through S178's complete 106-site verification.
- When component tokens execute, implement reader compound recipes by referencing the existing caption role and the shared reader responsive-gutter bindings rather than duplicating those leaf values under parallel token authorities.

Status: PASS.
