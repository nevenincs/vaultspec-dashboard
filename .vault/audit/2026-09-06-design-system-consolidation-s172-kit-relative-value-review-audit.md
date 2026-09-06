---
tags:
  - '#audit'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:fbf36776442b335aeae5913b21585dd747a3eb7712b01debe52088b70abf9aca'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
  - "[[2026-09-05-design-system-consolidation-adr]]"
  - "[[2026-09-05-design-system-consolidation-horizontal-polish-research]]"
  - "[[2026-09-05-design-system-consolidation-shipped-frontend-blueprint-reference]]"
---

# `design-system-consolidation` audit: `S172 kit relative-value classification review`

## Scope

Reviewed exact Step `W01.P01.S172`: all arbitrary relative-value line-sites under `frontend/src/app/kit`, their stable ledger identities, source expressions, canonical owners, dispositions, and rationale fields against the accepted behavior-preserving consolidation decision and live kit implementations. Production sources, later value-classification families, and unrelated dirty graph and scene work remained outside the review boundary.

The independent raw scan reproduced exactly 106 production app/platform line-sites and exactly 18 disjoint kit line-sites, including the non-executable `SkeletonBar` width API example. The kit ledger imports as 18 entries with 18 unique collision-safe source keys; every recorded expression occurs in its declared live source, and manual source reconciliation distinguishes both repeated `FacetRow` `size-[0.5rem]` slots. The slice is exactly six `migrate` and 12 `retain-exact-geometry` dispositions. Existing DTCG migrations resolve byte-for-byte to `type.role.label.size` (`0.8125rem`), `type.role.meta.size` (`0.75rem`), `type.role.caption.size` (`0.6875rem`), and `spacing.1` (`0.25rem`). Planned FacetRow label and shared eyebrow-tracking roles preserve exactly `0.78125rem` and `0.025rem`; no migration snaps to a nearby value.

The focused `consolidation-ledger.test.ts` suite passed three of three tests. Independent `just lint frontend` exited 0 across ESLint, localization, relative-unit, domain, module-size, formatting, typecheck, token-drift, and Figma-name checks.

## Findings

### s172-kit-relative-value-classification | low | The kit slice is exhaustive, value-preserving, and correctly owned

No corrective finding surfaced. The 12 retained sites are exact primitive or state geometry whose coincidental equality to spacing or type magnitudes does not give them the corresponding foundation semantics: indicator thickness, FacetRow density and control silhouettes, keycap width, SearchField shell geometry, skeleton footprint, spinner stroke, and switch track height remain with their kit owners. The six migrations have exact semantic matches or explicit exact-value planned owners. The `SkeletonBar` documentation example is truthfully retained as caller-defined geometry within the accepted raw 106-line baseline rather than mislabeled as executable styling. No site warrants a local-defect disposition, and no neighboring token promotion is justified by independent reuse.

Scoped status and diffs show S172 changes only the development ledger and lifecycle records; no kit production or scene behavior was changed by this step.

## Recommendations

- Preserve the exact values and stated property boundaries when the six migrations execute; using full typography-role utilities must not overwrite unrelated inherited line-height or weight behavior.
- Carry all 18 reviewed kit identities unchanged into S178's complete 106-site mechanical ledger verification.

Status: PASS.
