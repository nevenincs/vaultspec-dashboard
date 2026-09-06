---
tags:
  - '#audit'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:0db15b7a593d24d26abb7c9c21d8d372a3fd2926dd3fc6606782b20aac0647a1'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
  - "[[2026-09-05-design-system-consolidation-adr]]"
  - "[[2026-09-05-design-system-consolidation-horizontal-polish-research]]"
  - "[[2026-09-05-design-system-consolidation-shipped-frontend-blueprint-reference]]"
---

# `design-system-consolidation` audit: `S178 relative-value completeness test review`

## Scope

Reviewed exact Step `W01.P01.S178`: the new relative-value completeness tests in `consolidation-ledger.test.ts` against the accepted 106-line raw baseline, the six reviewed ledger partitions, the complete live ledger and production TSX source set, schema and canonical-owner requirements, and representative missing/stale/duplicate mutations. Production implementation, later scanner enforcement, and unrelated dirty graph and scene work remained outside scope.

The test independently pins partitions S172=18, S173=14, S174=24, S175=9, S176=16, and S177=25. Their ordered concatenation is asserted identical to the 106-entry aggregate ledger; collision-safe stable keys must be unique, while bidirectional path-and-whole-expression multiset differences prove no missing or stale source line-site. The raw scanner retains the accepted dated regex semantics, and the syntax-aware scanner admits only numeric relative-unit utilities inside TypeScript string or template literal spans. It groups all qualifying utilities on a source line, includes `cqw`, preserves unit order, excludes unitless bracket values, and leaves comments and non-style syntax outside the executable set.

The resulting live evidence is raw 106 and executable 100. The exact six raw-only identities are five classified `repair-local-defect` entries—two `stem` array expressions, the CategoryLegend state destructure, the DateBasisSelect prose reference, and the FolderBrowser dependency array—plus the intentionally retained Skeleton width API documentation example. Runtime checks also require the exact disposition rationale keys, non-empty rationale values, valid unit vocabulary with no duplicates, exact expression-derived unit lists, valid owner layers and statuses, source-path existence, and existence plus declaration/token resolution for every `existing` canonical owner.

The focused `consolidation-ledger.test.ts` suite passed seven of seven tests. Independent `just lint frontend` exited 0 across ESLint, localization, px, domain, module-size, formatting, typecheck, token-drift, and Figma-name checks. `git diff --check` passed. S178 modifies only the development test; production app/platform sources have no scoped diff, and the unrelated scene diff fingerprint remains exactly `30817224d9b653c7858a39d9a7458252dbca682f`.

## Findings

### s178-relative-value-completeness-proof | low | The bounded ledger proof is complete and mutation-sensitive

No corrective finding surfaced. The source scanner excludes comments by AST span instead of subtracting prose by line number, and the two-direction multiset proof preserves repeated same-expression line-sites rather than collapsing them into a set. Stable-key uniqueness separately rejects partition overlap. The explicit Breadcrumb assertion demonstrates that co-located `leading-[1.4]` is excluded as unitless while the exact `text-[0.8125rem]` relative expression remains; the CommentThreadPanel assertion and general expression-derived unit equality cover `cqw` without broadening the dated raw-entry rule.

The mutation test removes a real ledger key, replaces one with a stale path-expression identity, and duplicates a stable source key. Each exercises the same difference or duplicate helpers used by the live assertions and proves the expected failure signal. The checks are deterministic over sorted bounded source discovery and do not couple completeness to formatting line numbers.

## Recommendations

- Reuse these expression extraction and bidirectional multiset semantics when S06 introduces the ratcheting design-system scanner, while keeping the dated 106 baseline distinct from future newly introduced violations.
- Preserve the six explicit raw-only classifications until the syntax-aware scanner repair retires the five defects and intentionally adjudicates documentation examples.

Status: PASS.
