---
tags:
  - '#audit'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:dc5b92de852927a04be5dcc4b8460ea13f933b4f6ec1fdd1149e4e2d3862b769'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
---

# `design-system-consolidation` audit: `S20 ActivityIndicator render contract review`

## Scope

Reviewed exact plan step `W02.P03.S20`: the new
`ActivityIndicator.render.test.tsx` coverage against the accepted consolidation
ADR, research and shipped-frontend reference, the design-system rule, and the
unchanged live `ActivityIndicator` implementation. The review checked that the
test-only step pins the shipped hidden and visible states, viewport-top visual
recipe, status/live-region behavior, determinate-count accessibility, localization,
and rerender behavior without changing production behavior or exposing the
component through the public barrel.

## Findings

### activity-indicator-contract | low | Shipped appearance and accessibility coverage passes

The six tests exercise both sides of the `visible` contract; pin the exact
non-blocking, fixed viewport-top pulse recipe; preserve one static `status` node
without progressbar semantics; and prove indeterminate activity does not fabricate
numeric progress. Determinate row counts are contained by `aria-hidden`, update
honest-so-far localized copy while reusing the existing status and count nodes, and
remain outside the live-region announcement. Locale changes cover both alternate
left-to-right and right-to-left catalogs through the real localization provider.
Exact class assertions are intentionally appropriate for this appearance-freeze
step rather than incidental overfitting. No production implementation change is
present in scope.

Independent verification passed: focused Vitest 6/6, the production design-system
scanner reported a clean 127-control inventory with the scene guard enabled, and
the focused diff check was clean. Executor evidence also records the combined
25/25 suite, typecheck, and full `just lint frontend` as passing.

## Recommendations

No corrective action is required for S20. Retain these assertions as the pinned
pre-barrel contract and proceed to the planned naming-debt reconciliation and
public export steps.

Status: PASS.
