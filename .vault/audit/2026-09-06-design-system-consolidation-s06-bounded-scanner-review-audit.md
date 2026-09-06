---
tags:
  - '#audit'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:89d4ec2e600f85c8ab21b88999426ea788c5064dc2078751711576618d6305d3'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
  - "[[2026-09-05-design-system-consolidation-adr]]"
---

# `design-system-consolidation` audit: `s06 bounded scanner review`

## Scope

Reviewed exact Step `W01.P02.S06`: the new bounded design-system scanner in `scan-design-system.mjs` against the accepted consolidation ADR, research, shipped blueprint, ledger/source state, and applicable design-system, architecture, production/dev, resource-bound, and workflow rules. Production and scene sources remained read-only; unrelated graph and scene dirt stayed outside scope.

The clean-tree execution is deterministic and currently reports the expected 125 native controls, 100 executable relative-value sites plus six reviewed raw exceptions, 12 pending app deep imports, one pending lower-layer import, zero findings, and scene fingerprint `30817224d9b653c7858a39d9a7458252dbca682f`. Human and JSON modes agree, and the JSON result uses schema `vaultspec.design-system.scan.v1` with sorted findings.

Independent `node --check` passed. Direct human and JSON scans both exited 0 with the same clean counts. `git diff --check` passed, and the independently recomputed scene fingerprint remained the expected value. Full `just lint frontend` also exited 0 across ESLint, localization, px, domain, module-size, Prettier, TypeScript, token-drift, and Figma-name checks. Those current-tree green results do not resolve the mutation/bypass findings below.

## Findings

### s06-ledger-runtime-schema | high | Invalid family dispositions and owner or naming shapes pass the scanner

`validateLedger` at `scan-design-system.mjs:873-964` validates dispositions only against the global union and checks an owner only when status happens to equal `existing`. It does not enforce each ledger family's allowed disposition set, canonical-owner status, normalized frontend path, planned/existing path semantics, or naming-debt `debtKind`, `codeName`, `designAlias`, and source/owner correspondence. Independent in-memory mutations proved four invalid ledgers all returned `clean` with zero findings: a native control changed to `track-parity-debt`, a relative value changed to `retain-semantic-seam`, an owner changed to status `bogus` and path `outside/repo.ts`, and a naming entry changed to an unknown debt kind with empty code name and invented alias.

The scanner transpiles the TypeScript ledger without type-checking, so the separate lint command cannot substitute for runtime validation in this guard. Enforce the schema's family-specific disposition sets and all canonical-owner and naming-debt fields before semantic comparisons; malformed shapes should produce deterministic `ledger-invalid` findings rather than pass or crash.

Resolution: the validator now enforces family-specific disposition sets, normalized source and canonical-owner paths, owner layer/name/status, native element vocabulary, relative expression and unit shapes, and naming-debt kind/name/null-alias/correspondence. Source-key construction is fail-closed without mutation crashes, and non-naming TS/TSX source owners are checked against live declarations. Re-running all four original mutations produced `violations` with `ledger-invalid`; a malformed source produced deterministic invalid/missing/stale findings, and a separately mutated relative source owner produced `ledger-stale`.

### s06-cqw-admission | medium | A new cqw-only arbitrary utility is invisible

`NUMERIC_RELATIVE_UNIT_PATTERN` includes `cqw`, but `RAW_RELATIVE_VALUE_PATTERN` at `scan-design-system.mjs:238` admits a line only when it contains `rem`, `em`, `vw`, `vh`, or `%`. The existing CommentThreadPanel compound line is seen only because it also contains `rem`; a future utility such as `w-[50cqw]` is skipped entirely and therefore cannot become a missing-ledger finding. Add `cqw` to the admission vocabulary while preserving the reviewed current 106 raw-line/100 executable-site baseline, compound grouping, unitless exclusion, and five-defect-plus-documentation exception set.

Resolution: `cqw` is now part of the raw admission pattern. A direct `w-[50cqw]` probe is admitted, while the real scan remains exactly 100 executable sites plus six classified raw exceptions and retains the 106-line reviewed partition.

### s06-ownership-ratchets | medium | Common facade and duplicate-debt forms bypass ownership findings

Facade detection at `scan-design-system.mjs:731-819` catches direct module re-exports, exported identifier variables, and narrow props-only wrappers, but misses the common two-statement form `import { Button } from "@app/kit"; export { Button };` because export declarations without a module specifier never enter `moduleSpecifiers` and `visitFacade` does not inspect them. The same gap applies to an export assignment of an imported kit binding. Resolve local export specifiers/assignments against the known kit-import bindings and flag only direct aliases, retaining the current false-positive-safe treatment of wrappers that add behavior or structure.

The shrinking import ratchets at `scan-design-system.mjs:708-748` store seen baseline identities in sets keyed only by path and specifier. A second deep import using the same allowed path/specifier is treated as the existing debt and is not rejected, so the nominal 12+1 site baseline can grow while the summary remains 12+1. Track occurrence counts and permit each reviewed identity at most once; any duplicate occurrence must be a new `kit-deep-import` or `layer-direction` finding.

Resolution: local named export clauses and export assignments are now resolved against exact kit import bindings, while behavior-bearing wrappers remain outside the narrow facade predicate. Pending deep and lower-layer identities are accepted only on their first occurrence; subsequent identical occurrences fall through to `kit-deep-import` or `layer-direction`. The live ratchets remain exactly 12+1.

### s06-subprocess-bounds | low | Scene fingerprint subprocesses have no explicit timeout

The two synchronous Git calls at `scan-design-system.mjs:1096-1105` provide neither an explicit wall-clock timeout nor an explicit output cap. Node's implicit buffer ceiling is fail-closed but undocumented in this scanner, while a configured Git filter or wedged child can block the lint recipe indefinitely. Supply fixed `timeout` and `maxBuffer` values from the scanner limits and report spawn errors deterministically. The file and finding accumulators are otherwise capped, symlinks are rejected, paths are root-checked, and source files are size-limited.

Resolution: both Git subprocesses now use an explicit 15-second timeout and 16 MiB `maxBuffer`, and treat spawn errors or nonzero status as deterministic scanner failure.

## Recommendations

- Add mutation-focused S08 fixtures for every corrected runtime schema field, a `cqw`-only utility, local import-then-export facades, export assignments, and duplicate occurrences of each allowed import-ratchet class.
- Keep the accepted dated baseline exact after correction: 125 native sites, 106 reviewed raw relative lines partitioned as 100 executable plus five defects plus one documentation example, and shrinking import debt at no more than 12+1 occurrences.

Post-resolution verification: `node --check` passed; direct human and JSON scans independently returned the expected clean counts and scene fingerprint; repeated JSON output was deterministic; `git diff --check` passed; and post-fix `just lint frontend` exited 0 through the full recipe including TypeScript. No regression or remaining material finding surfaced.

Status: PASS.
