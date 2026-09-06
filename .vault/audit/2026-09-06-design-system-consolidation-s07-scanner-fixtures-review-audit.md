---
tags:
  - '#audit'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:7e305a5264fa586108700c0e58260a2dee7d59a2eb0639fcc2ce3db94f9f35c3'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
  - "[[2026-09-05-design-system-consolidation-adr]]"
---

# `design-system-consolidation` audit: `s07 scanner fixtures review`

## Scope

Reviewed exact Step `W01.P02.S07`: the 19-case design-system scanner fixture manifest, all fixture sources, the temporary-root harness and declarations, and the narrow scanner policy-injection surface against the accepted plan, ADR, research, reference, rules, and settled S06 audit. Production and scene sources remained read-only.

The manifest contains 19 stable, unique, ordered IDs: three valid cases and 16 invalid cases. Valid coverage proves classified native and compound relative seams including `w-[50cqw]` and nested `calc(100cqw-2rem)`, exclusion of unitless values and comment prose, the exact `[...related, stem]` raw-scanner defect shape, and preservation of behavior-bearing wrappers. Invalid cases isolate missing native/relative entries, stale and duplicate native entries, malformed source and ledger shape, new and duplicate pending deep imports, both store and platform lower-layer imports, direct/local/export-assignment/props-only facade forms, and both no-Figma and scene invariant fences.

The harness transpiles the typed manifest in memory, creates a fresh OS temporary root per case, copies one minimal fixture, injects only explicit test policy, compares sorted unique actual finding codes with the exact expected set, and removes the exact generated root in `finally`. Production CLI invocation supplies none of the injection options and therefore retains S06 defaults. The `.d.mts` declarations accurately describe the public report, scan options, constants, and fixture-result API.

Independent evidence passed: scanner and harness syntax checks passed; the harness reported 19/19 clean expectations (3 valid, 16 invalid); the production human scanner remained clean at 125 native, 100 executable relative plus six exceptions, and 12+1 import debts; `git diff --check` passed; the scene fingerprint remained `30817224d9b653c7858a39d9a7458252dbca682f`; and full `just lint frontend` exited 0 through ESLint, repository scanners, Prettier, TypeScript, token drift, and Figma-name checks.

## Findings

### s07-scanner-fixtures | low | Fixtures are isolated, deterministic, and cover the requested failure families

No corrective finding surfaced. Every invalid case returns `violations` through its nonempty exact code set, while valid cases are additionally required to return `clean`; incidental extra findings fail the case. The sources are minimal enough to attribute each result to its intended scanner branch, and fixture-only policy cannot weaken direct production execution.

## Recommendations

- Preserve exact code-set comparison and per-case temporary-root cleanup as S08 promotes these cases into the test runner.
- Add future fixture cases only with unique semantic IDs and one isolated contract failure; do not broaden injected policy in production CLI paths.

Status: PASS.
