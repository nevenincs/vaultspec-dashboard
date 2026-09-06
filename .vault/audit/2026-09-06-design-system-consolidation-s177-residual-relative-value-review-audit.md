---
tags:
  - '#audit'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:fbfc3c66d7a7333f690099efe092b8f2db636e8c5c71c273a5f00fd68aa40970'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
  - "[[2026-09-05-design-system-consolidation-adr]]"
  - "[[2026-09-05-design-system-consolidation-horizontal-polish-research]]"
  - "[[2026-09-05-design-system-consolidation-shipped-frontend-blueprint-reference]]"
---

# `design-system-consolidation` audit: `S177 residual relative-value classification review`

## Scope

Reviewed exact Step `W01.P01.S177`: the residual dated raw relative-value slice after S172-S176, all 25 appended ledger identities, complete co-located relative expressions and unit sets, dispositions, canonical owners, rationale fields, and downstream W06 alignment against the accepted behavior-preserving consolidation decision and live source. S178's final completeness proof and unrelated dirty graph and scene work remained outside scope.

The independent TSX raw scan reproduced the dated 106 production app/platform line-sites. Subtracting the exact 81-entry accepted prefix leaves 25 source line-sites, and the S177 slice contains 25 collision-safe unique identities with exact path-and-expression multiset equality, no prefix overlap, and the proposed split of five `migrate`, 19 `retain-exact-geometry`, and one `repair-local-defect`. This is slice reconciliation evidence, not the global completeness claim reserved for S178.

The focused `consolidation-ledger.test.ts` suite passed three of three tests. Independent `just lint frontend` exited 0 across ESLint, localization, px, domain, module-size, formatting, typecheck, token-drift, and Figma-name checks. `git diff --check` passed. The S177 implementation diff is ledger-only: production app sources have no scoped diff, and the unrelated pre-existing scene changes remain unchanged and outside review.

## Findings

### s177-rag-jobs-grid-rationale | low | The retained GRID rationale miscounts its five columns

`consolidation-ledger.ts:5337` says the `RagJobsTable` template contains three 6rem columns, two flexible 6rem floors, and a 7rem duration column, which describes six tracks. The live and recorded expression has five tracks: two fixed 6rem columns, two flexible columns with 6rem floors, and one 7rem column. The disposition and complete expression are correct, but the rationale is not factually auditable as written.

### s177-rag-jobs-grid-rationale-resolution | low | The five-column rationale is corrected and the slice passes re-review

Resolved in the reviewed worktree. The constraint now states exactly two fixed 6rem columns, two flexible columns with 6rem floors, and the 7rem duration column. The post-correction residual probe again returns raw 106, prefix 81, residual 25, S177 25, accumulated 106, 106 unique identities, and zero unmatched-prefix, missing, or stale path-expression keys; the disposition split remains five migrations, 19 retained exact geometries, and one repair.

The full FeatureSuggestionList placement and height expression, all five ordered left-rail percentage widths, both panel GRID templates, both right-rail compound skeleton bars, and the FolderBrowser dependency-array false positive bind their live source exactly. WorktreePicker and FrameworkStatusCluster map to explicit W06 consumers; exact existing type metrics and the already-planned shared eyebrow role remain value-preserving. No retained entry claims a coincidentally equal foundation role. The post-correction focused test passed three of three, `git diff --check` passed, and the independently rerun full frontend lint exited 0. No scoped production or scene diff was introduced.

## Recommendations

- [x] Replace the `job-table-column-template` constraint with the exact five-column description.
- [x] Rerun the exact residual probe, focused ledger test, diff hygiene, and full frontend lint after correction.
- Carry these 25 reviewed identities into S178's independent final completeness proof without treating this slice review as that proof.

Status: PASS.
