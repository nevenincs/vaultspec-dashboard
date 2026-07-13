---
tags:
  - '#research'
  - '#test-infra-hardening'
date: '2026-07-13'
modified: '2026-07-13'
related:
  - "[[2026-07-02-test-infra-hardening-audit]]"
  - "[[2026-07-02-test-infra-hardening-plan]]"
  - "[[2026-07-13-test-infra-hardening-adr]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #research) and one feature tag.
     Replace test-infra-hardening with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `test-infra-hardening` research: `flake census and root-cause findings, extracted from the test-infra-hardening audit`

RETROACTIVE RECORD: the research phase for this feature was performed as the standing
architecture audit `test-infra-hardening-audit` (2026-07-02), not as a separate document —
the audit itself was the investigative act (a code-grounded census plus root-cause tracing),
and its remediation plan and this retroactive ADR were executed directly off it. This
document is a retroactive extraction of that investigation's findings, held here for
pipeline-graph completeness (a plan-with-ADR-with-research chain), not a second independent
investigation.

The investigation was a standing audit of the shared live-engine frontend test
infrastructure: the disease behind the `VaultBrowser.render.test.tsx` GS-007 flake symptom.
The suite runs ~2,500 tests across 150+ files ONLINE against one real `vaultspec serve`
process, serialized (`fileParallelism: false`). The audit examined the engine boot/teardown
lifecycle, per-suite transport and scope resolution, timeout policy across test files,
write-load on the shared engine and its server-side consequences (the watcher/fold
rebuild path), and fixture-state determinism.

## Findings

**Foundations verified sound (TIH-001).** The load-bearing choices were confirmed correct
and preserved through remediation: the suite runs online against the real engine over a
committed deterministic fixture vault (no mock to drift), the OS-assigned ephemeral port is
the sanctioned exception to the strict-ports rule, an externally-provided engine is
adoptable via `ENGINE_BASE_URL` for CI, a real degraded sibling worktree gives degradation
tests a genuine down tier, and `fileParallelism: false` is a correct consequence of one
shared mutable engine — the defect was in what rides on that serialization, not the
serialization itself.

**Timeout policy inversion (TIH-002, high).** Vitest's configured test/hook budgets (15s /
35s) were not the effective gate: nearly every live render assertion actually gated on
testing-library's `waitFor` library default of 1,000ms. Census: 116 `waitFor(` callsites
across 25 test files, of which exactly one passed an explicit timeout. The flake site was
the densest consumer, with 18 default-1s gates in one file including an `afterEach` drain
racing a background fetch against the shared engine. Any transient engine latency above
~1s (a rebuild, a cold projection, CPU contention) failed an assertion 14 seconds before
the test's real budget expired.

**Write-triggered rebuild storms (TIH-003, high).** 148 engine-write callsites across 28
test files each triggered the engine watcher's debounced re-index pipeline on commit: a
structural re-index, a generation bump invalidating every per-generation memoized
projection, and a present-view fingerprint-cache miss that spawned a Python core subprocess
(seconds of interpreter startup on Windows). A read-heavy render suite running after a
write-heavy one paid cold-projection latency and CPU contention exactly when its 1s
`waitFor` gates (TIH-002) were ticking. No quiescence barrier existed anywhere in the
harness before or between suites.

**Fixture-state drift (TIH-004, medium).** Write suites mutated the one shared fixture
vault with no restore path — zero `afterAll`/restore/revert callsites found by grep in the
densest write suite, and no preimage reapplication at teardown anywhere. Corpus state
observed by later suites became run-order-dependent, silently violating the suite's own
"deterministic fixture vault" premise, and every un-reverted write multiplied TIH-003 by
becoming a permanent fingerprint change plus a rebuild.

**Engine binary mtime race (TIH-005, low).** The harness picked the freshest engine binary
by directory mtime, which could race an in-flight `cargo build` on a dev machine — either a
loud spawn failure on a half-linked binary, or the subtler case of silently running a
binary newer than the sources the test expectations were written against.

**First-file cold-start race (TIH-006, low).** Global setup declared ready on the first
`/status` 200, but the declared tier folds asynchronously after boot, so the earliest test
files could run against a still-building tier — the same missing-barrier gap as TIH-003,
absorbed today only by luck and the 35s hook timeout.

**Re-diagnosis of the GS-007 crux (TIH-007, high).** Escalation testing (a strengthened
quiescence barrier plus an extended timeout) still produced 0/4 identical failures at
`VaultBrowser.render.test.tsx:328`, ruling out both latency and progressive engine
degradation as the cause. The actual mechanism, traced through the code: an earlier test in
the same file persisted a server-side selection on the shared engine scope via a raw
`patchDashboardState` call (not a TanStack query or mutation, so the `afterEach`
`isFetching()===0` drain could not see it, and `happyDOM.abort()` killed it mid-flight —
the observed `AbortError`); the reveal-on-selection reaction (landed since, follow mode
defaults on) then reacted to the leaked selection arriving on a later background fetch,
either detaching the already-captured DOM element or pre-expanding a folder so the test's
click collapsed it instead — either way, no leaf ever mounted, and no timeout value would
have fixed it. The identical leaf lookup passing earlier in the same file (before any
selection existed) and failing only after one ruled out resource-growth-based degradation
theories.

## Option space considered (grounds the plan/ADR)

Reviewed in the audit's Recommendations section, ordered for independently-landable,
zero-product-risk remediation: (1) a shared timing-policy module plus a wrapped `waitFor`
defaulting to an engine-appropriate gate, swept across the 25 affected files; (2) a shared
`awaitEngineQuiescent()` barrier (tiers-available plus generation-stable over the existing
`/status` truth) used once in global setup and in render-suite `beforeAll`s; (3) write
hygiene — sacrificial-document convention with preimage restore in `afterAll`, plus
snapshot-restore for settings/session suites, with per-suite scratch scopes noted as a
longer-term isolation option; (4) an explicit engine-binary override plus a chosen-binary
banner, mtime kept only as fallback; (5) a per-file wall-clock reporter to capture baseline
and post-fix timing as measured closeout evidence. Rejected as insufficient on their own:
raising the global `waitFor` timeout blindly (papers over TIH-003's rebuild storms without
fixing them) and treating TIH-007 as a latency problem (disproven by the re-diagnosis — no
timeout value fixes a lost DOM reference). All five recommendations were carried into the
plan's five phases without alteration.
