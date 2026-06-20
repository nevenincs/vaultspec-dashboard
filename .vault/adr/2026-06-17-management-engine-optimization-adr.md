---
tags:
  - '#adr'
  - '#management-engine-optimization'
date: '2026-06-17'
modified: '2026-06-17'
related:
  - "[[2026-06-17-management-engine-optimization-research]]"
---



# `management-engine-optimization` adr: `Rust backend hardening and live-signal cleanup` | (**status:** `accepted`)

## Problem Statement

The Becca/Rust management engine is already protected against the most obvious
unbounded response and subprocess failure modes, but current research still finds
resource-intensive work inside request, rebuild, commit, and first-use semantic paths.
The dashboard can therefore stay slow even when it no longer crashes.

The same campaign also needs stronger test signal discipline. Engine and data-provider
tests that pass by exercising `MockEngine`, fakes, stubs, skipped live suites, or
mocked transports can produce green runs without proving the live Rust backend behavior
that this optimization work depends on.

## Considerations

- Preserve the current wire contract, including tiers blocks and bounded degradation
  responses.
- Keep graph compute in Rust/backend layers; GPU and browser work remain render/search
  concerns only.
- Prefer generation-keyed caches and indexes over request-local rescans.
- Shorten lock-held commit sections before adding broader parallelism.
- Replace exact graph algorithms only where the result can be bounded and verified with
  live, non-tautological fixtures.
- Treat live engine conformance as a gate, not an optional skipped suite.
- Allow UI-only callback spies only when no engine/data-provider behavior is asserted.

## Constraints

This decision builds on the completed resource-hardening and backend-hotpath-hardening
work, both of which are stable enough to preserve rather than reopen. The active
dashboard-state centralization work is not yet fully reconciled in its plan state, so
changes that touch dashboard state routes must first verify the current source and
avoid clobbering concurrent work.

The worktree is shared and already dirty. Execution must avoid destructive git
commands and must keep edits path-scoped. Tests must import and exercise production
code directly; no fakes, stubs, monkeypatches, skips, xfails, or duplicated business
logic may be used as shortcuts to a green run.

## Implementation

The backend implementation will add bounded, generation-keyed query support around the
document graph so common filters and edge selections avoid full node and edge rescans
per request. Filter evaluation will move toward compiled membership and normalized text
state so the request path does not repeatedly allocate or linearly search filter
vectors.

The salience path will be hardened by replacing the current quadratic k-core peeling
with a bounded linear form and by isolating centrality work behind scale-aware behavior
that can later accept approximation. Commit handling will move graph-scale projection
work out of lock-held sections where possible, while preserving sequence ordering and
ring semantics. Historical graph reads will reuse projection state inside existing
bounded as-of cache entries instead of rebuilding views on every repeat request.

The test cleanup will classify engine/data-provider tests by confidence value and
rewrite backend-relevant tests to exercise live routes, real fixtures, or real service
instances. Existing fake-positive generators such as skipped conformance suites,
mocked engine transports, stubs, and authored fake business behavior will be removed
from backend confidence gates rather than counted as proof.

## Rationale

The research shows that the remaining performance problems are dominated by repeated
CPU work before serialization caps take effect: graph-wide scans, per-node text
allocation, salience construction, feature delta projection, as-of projection rebuilds,
and first semantic vector scrolls. These are architectural hotpaths, not isolated bugs.
A plan that only adds more bounds would leave the application slow.

The same research shows broad fake-signal risk in the frontend and test harness. Since
the purpose of this campaign is backend hardening and performance, tests that do not
exercise live backend behavior cannot be used as release confidence for these changes.

## Consequences

The expected benefit is lower request CPU, shorter rebuild recovery, less lock
contention, and more trustworthy green runs. The cost is that some tests will become
slower or require a live backend fixture, and some historical UI tests may need to be
renamed, rewritten, or removed from backend confidence gates.

The main implementation risk is changing graph ranking or edge selection semantics
while optimizing. Verification must therefore compare live responses against
observable invariants and fixtures rather than mirrored implementation logic.

## Codification candidates


- **Rule slug:** `engine-tests-use-live-behavior`.
  **Rule:** Tests that assert management-engine or data-provider behavior must exercise
  production code through live routes, real fixtures, or real service instances; mocks,
  fakes, stubs, monkeypatches, skips, and xfails are not acceptable confidence signals.
