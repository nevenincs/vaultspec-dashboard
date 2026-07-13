---
tags:
  - '#adr'
  - '#test-infra-hardening'
date: '2026-07-13'
modified: '2026-07-13'
related:
  - "[[2026-07-02-test-infra-hardening-audit]]"
  - "[[2026-07-02-test-infra-hardening-plan]]"
  - "[[2026-07-13-test-infra-hardening-research]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #adr) and one feature tag.
     Replace test-infra-hardening with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     Status convention: the H1 status value is one of proposed, accepted,
     rejected, superseded, or deprecated. A new ADR starts as proposed; it
     moves to accepted or rejected when the decision is made; it becomes
     superseded when a later ADR replaces it (set by vault adr supersede,
     which also records superseded_by); and deprecated when it is retired
     without a direct successor.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `test-infra-hardening` adr: `shared timeout policy, engine-quiescence barrier, and fixture-isolation hardening for the frontend test harness` | (**status:** `accepted`)

## Problem Statement

RETROACTIVE RECORD: this decision was executed directly against the `test-infra-hardening`
audit's findings on 2026-07-02 without an ADR checkpoint at the time; this document records
it after the fact rather than leaving the executed plan ungrounded.

The `test-infra-hardening` audit (TIH-001 through TIH-007) found the frontend live-engine
test suite carried unbounded/inconsistent wait timeouts across roughly 116 `waitFor`
callsites in ~25 files (TIH-002, HIGH), no barrier ensuring the engine had reached
quiescence before assertions ran, letting waits race write-triggered rebuild storms
(TIH-003/TIH-006, HIGH/LOW), a cross-test server-side selection leak that let one suite's
state corrupt another's DOM assertions (TIH-007), write-touching suites that left mutated
state behind for later suites (TIH-004, MED), and an engine-binary selection step that could
race an in-flight cargo build (TIH-005, LOW). TIH-001 was confirmed sound and needed no
change.

## Considerations

The fixes are all test-harness-only (zero product risk) but touch the shared suite
extensively (~25 files), so they needed to land as one coordinated hardening pass rather
than piecemeal, and ahead of the external ASA team's W09 wave to avoid the team building on
top of the flaky baseline.

## Considered options

- **Fix each flaky/racy test locally as it is hit (status quo)** — cheap per-instance but
  never converges; the same wait/quiescence/leak classes recur across ~25 files. Rejected.
- **One coordinated hardening pass: shared timeout policy + quiescence barrier + fixture
  isolation + binary-selection guard + measurement** — addresses each audit-identified root
  cause once, at the shared-infrastructure layer, with before/after timing evidence. Chosen.

## Constraints

Test-infra-only; carries no risk to shipped product code. Depends on the live-engine test
harness (`liveEngine.globalSetup.ts`, `liveSetup.ts`) remaining the shared entry point for
every affected suite.

## Implementation

Built `frontend/src/testing/timing.ts` as a shared engine-round-trip timeout policy plus a
wrapped `waitFor`, and swept the ~25 affected test files onto it (TIH-002). Added
`awaitEngineQuiescent()` (tiers-available plus generation-stable over `/status`) to the
live-engine global setup and render-suite `beforeAll`s so assertions no longer race
write-triggered rebuild storms (TIH-003/TIH-006). Fixed the `VaultBrowser` cross-test
server-side selection leak via a `beforeEach` dashboard-state reset, closing the happy-dom
drain blind spot where a raw patch was invisible to the `isFetching` drain (TIH-007). Made
write-touching suites restore state in `afterAll` — sacrificial-document and preimage
restore, settings/session snapshot-restore, per-suite scratch scopes — removing run-order
coupling (TIH-004). Added a `VAULTSPEC_TEST_ENGINE_BIN` override plus a chosen-binary
banner so the mtime-picked engine binary cannot race an in-flight cargo build (TIH-005).
Instrumented a per-file wall-clock vitest reporter and captured baseline and post-fix
timing runs as closeout evidence.

## Rationale

Every change traces directly to a numbered TIH finding in the 2026-07-02
`test-infra-hardening` audit; the audit is the originating decision record (this ADR
satisfies the vaultspec lifecycle requirement for a decision checkpoint, recorded
retroactively since the remediation plan was executed directly off the audit).

## Consequences

Removes the recurring wait/quiescence/leak/run-order-coupling flake classes from the shared
live-engine suite before the external ASA team's W09 wave began building on it, with
measured before/after timing evidence. The cost is the one-time sweep touching ~25 test
files; no product-code risk. No known pitfalls.
