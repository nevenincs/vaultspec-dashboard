---
name: mock-mirrors-live-wire-shape
---

# Frontend tests exercise the live engine wire, never a divergent double

## Rule

Frontend tests must exercise the SAME engine wire the live app uses — never a
divergent test-double of it. The suite runs ONLINE against the real
`vaultspec serve` origin over a committed fixture vault
(`frontend/src/testing/fixtures/`), wired through the vitest `globalSetup`
(`frontend/src/testing/liveEngine.globalSetup.ts`, "no mocks, no shadows") and the
shared `liveClient` transport. A new test that stubs, fakes, or `vi.mock`s the
engine wire — serving a convenient shape the live origin never emits — is a
test-fidelity defect; it must drive the live origin (or a captured-verbatim live
sample) through the same client code path the app uses.

## Why

The original failure mode was a `mockEngine` whose shape DIVERGED from live: a mock
that served a different shape let every test pass while the live app broke. This
trap fired twice — the S49 live-origin pass found five capability divergences, and
the 2026-06-13 GUI addendum found the mock folding constellation meta-edges into
`edges[]` so feature nodes rendered with zero edges against the live engine (which
returns a SEPARATE `meta_edges` array with `edges` empty). The project resolved this
entire bug class AT THE ROOT by eliminating the mock: the frontend suite now boots
the real `vaultspec serve` in `liveEngine.globalSetup.ts` and tests against it
directly. That is strictly stronger than a mirrored mock — there is no double, so
nothing can diverge. The once-required "mock must mirror live" obligation is moot
because the mock is gone; the rule's intent (tests exercise the real wire, never a
divergent double) is now satisfied by construction. The tolerant adapter
(`frontend/src/stores/server/liveAdapters.ts`) still bridges wire-shape variations,
but it is now exercised against reality rather than an assumed double.

## How

- **Good:** a new stores/wire test drives the live `vaultspec serve` (via the global
  setup) over the fixture vault and asserts against the real served shape — e.g. the
  `plan_states` integration test reads the live `/filters` vocabulary, asserts the
  Plan-status facet row renders, and toggles it to narrow the real graph.
- **Good:** a wire-shape variation the engine settles differently (the `{data, tiers}`
  envelope, the separate `meta_edges` array) is absorbed by the tolerant
  `liveAdapters.ts`, exercised against the live origin.
- **Bad:** introducing a `vi.mock` / stub / fake of the engine wire that serves a
  convenient internal shape — the live reconciliation is never tested against reality,
  re-creating the mock-vs-live divergence this rule (and the no-mocks-no-shadows test
  architecture) exists to prevent.

## Status

Active, with an evolved mechanism (edit-in-place codify, not a supersede — the
constraint is continuous; only its enforcement changed). ORIGINALLY (promoted
2026-06-13): the GUI was tested against a `mockEngine` that had to mirror the live
wire byte-for-byte, after the mock-vs-live divergence pattern recurred across the S49
client-conformance pass and the feature-constellation addendum. EVOLVED (verified
2026-06-23): the `mockEngine` was eliminated; the suite now runs online against the
real `vaultspec serve` — `vite.config.ts` wires `globalSetup` to
`liveEngine.globalSetup.ts` ("no mocks, no shadows"), `liveSetup.ts` notes "no mock
to leak between suites", and `grep mockEngine` across `frontend/` returns zero
matches. The slug `mock-mirrors-live-wire-shape` is retained for reference stability
(siblings cross-reference it); the principle holds even though the mock it named is
gone.

## Source

GUI cycle audit `2026-06-12-dashboard-gui-audit` (S49 live-origin divergence set) and
plan `2026-06-13-dashboard-gui-plan` (S02/S03 feature-constellation consumption,
original promotion). Live-engine evolution surfaced and verified 2026-06-23 by the
`plan_states` mock-vs-live drift audit (no mockEngine exists; the populated-facet gap
it found was closed by a live-engine integration test
`frontend/src/app/stage/FilterSidebar.planStates.test.ts`). Sibling rules
`every-wire-response-carries-the-tiers-block`, `dashboard-layer-ownership`,
`engine-read-and-infer`, `degradation-is-read-from-tiers-not-guessed-from-errors`.
