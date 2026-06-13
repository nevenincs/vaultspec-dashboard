---
name: mock-mirrors-live-wire-shape
---

# Mock engine doubles must mirror the live wire shape exactly

## Rule

A test-double of the engine wire (the GUI's `mockEngine`) must serve the exact
shape the live `vaultspec serve` origin serves - the same top-level field
carrying each datum, and the same default for every optional request parameter
- and that fidelity must be proven by feeding a captured live sample through
the same client code path the app uses. A divergence between mock and live is a
test-fidelity defect to fix in the mock, never papered over by adapting only
the live side.

## Why

The GUI is built and tested against `mockEngine` behind the same client
transport as the live origin (the S49 "one code path serves both origins"
property), so a mock that serves a different shape lets every test pass while
the live app breaks. This trap has fired twice: the S49 live-origin pass found
five capability divergences between the closed implementation and the live
serve, and the 2026-06-13 GUI addendum found the mock folding constellation
meta-edges into `edges[]` and never serving feature granularity - so the
constellation passed every mock test yet rendered feature nodes with zero edges
against the live engine, which returns a SEPARATE `meta_edges` array with
`edges` empty. The tolerant adapter (`adaptGraphSlice`) is the bridge, but it is
only exercised against reality when the mock actually emits the live shape.

## How

- **Good:** the mock honors `granularity` and emits the canonical SEPARATE
  `meta_edges` array (with `edges` empty) at feature granularity and document
  edges by default - byte-for-byte the live wire - and a consumer test feeds a
  verbatim captured live sample through `adaptGraphSlice` and asserts the fold.
- **Good:** when the live engine settles a shape differently (the
  `{data, tiers}` envelope, stem-keyed vault trees), the mock is updated to that
  shape and the adapter stays tolerant of both; one client path covers both
  origins.
- **Bad:** the mock serves a convenient internal shape (meta-edges inlined into
  `edges[]`, no granularity parameter) that the live origin never emits - the
  client's reconciliation is never tested against reality and the divergence
  ships green.

## Status

Active. Promoted after the mock-vs-live divergence pattern recurred across a
full cycle: the S49 client-conformance pass, then the 2026-06-13 GUI
feature-constellation addendum. The tolerant-adapter pattern in
`frontend/src/stores/server/liveAdapters.ts` is the bridge; this rule binds the
mock to the live shape so that bridge is verified, not assumed.

## Source

GUI cycle audit `2026-06-12-dashboard-gui-audit` (S49 live-origin divergence
set); plan `2026-06-13-dashboard-gui-plan` (S02/S03 feature-constellation
consumption: mock reconciled to the separate `meta_edges` wire). Sibling rules
`every-wire-response-carries-the-tiers-block`, `dashboard-layer-ownership`,
`engine-read-and-infer`.
