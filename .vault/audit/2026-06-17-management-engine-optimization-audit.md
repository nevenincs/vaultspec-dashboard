---
tags:
  - '#audit'
  - '#management-engine-optimization'
date: '2026-06-17'
modified: '2026-07-12'
related: []
---

# `management-engine-optimization` audit: `initial execution review`

## Scope

Reviewed the initial execution slice for the management-engine optimization plan:
salience coreness optimization, salience invariant coverage, and live frontend engine
conformance gating.

## Findings

No critical or high findings.

## initial-execution-001 | low | follow-up backend timing fixture remains open

The coreness implementation is now linear and covered by focused unit tests, but the
separate production graph query timing fixture step remains open. This is expected for
the first execution slice and should be completed before claiming broader performance
baselines.

## backend-test-signal-002 | low | captured samples still need live-route promotion

The store/server tests no longer instantiate `MockEngine`, but several retained adapter
tests still use captured live-shaped samples. Those tests are useful parser checks, not
live backend confidence. Future cleanup should promote the important route contracts to
live-client tests before treating them as backend gates.

## request-hotpath-003 | low | broader query indexing remains open

The filter path now uses the validated sorted facet invariant for binary-search
membership and normalizes the text needle during validation, with `engine-query` and
live conformance verification passing. This closes the small repeated-allocation slice,
but the larger generation-keyed query index work remains open and should still be the
next throughput step before claiming the full document-query scan hotspot resolved.

## live-search-004 | low | runner teardown noise still needs classification

The search route now uses a shorter bounded sibling budget and keeps semantic-tier
degradation behavior, which restored the live conformance gate under the test timeout.
The live frontend run still emits post-assertion connection-reset noise during harness
teardown. It did not fail assertions, but it should be classified or eliminated before
treating console-clean live runs as a gate.

## final-execution-005 | low | retired component gallery keeps a seeded engine wire outside test gates

The default frontend source test tree no longer imports the authored engine double, and
`frontend/src/testing` no longer exports it. A seeded engine wire remains under
retired component gallery support so design surfaces can render populated chrome. It is outside Vitest
and outside backend confidence, but should not be reintroduced into `frontend/src/testing`
or backend-facing tests.

## final-execution-006 | low | live runner teardown noise remains console-visible

The full frontend suite, live backend suite, Rust API suite, and engine-query gates pass.
The frontend runner still prints post-success socket-reset and happy-dom abort messages
during teardown. These are not assertion failures, but the console noise should be
cleaned before making "no stderr after green" a release gate.

## final-review-007 | low | no critical or high implementation findings

Reviewed the completed implementation slice: document query indexes, scope-state wiring,
commit critical-section narrowing, as-of projection reuse, semantic timing, benchmark
ceiling enforcement, and fake-backed frontend test removal. No critical or high findings
were found. The main remaining risk is operational: retired-gallery-only seeded data must stay
out of backend confidence gates.

## Recommendations

Continue with the plan in order: add production graph query timing fixtures before
larger query-index work, then execute compiled filter evaluation as the next small
backend hotpath step. Continue fake-signal cleanup by moving high-value captured-sample
adapter checks to live-client tests and deleting the sample-only duplicates.

## Codification candidates

None from this review. The durable live-behavior testing constraint is already captured
as an ADR codification candidate.
