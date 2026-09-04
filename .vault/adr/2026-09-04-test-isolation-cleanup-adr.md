---
tags:
  - '#adr'
  - '#test-isolation-cleanup'
date: '2026-09-04'
modified: '2026-09-04'
body_schema: 'body-v2'
body_hash: 'sha256:f463327458e648c3402c4a7d27a4172d2033385ea84cfa3cc9aaaefe74a113b9'
related:
  - "[[2026-09-04-test-isolation-cleanup-research]]"
---

# `test-isolation-cleanup` adr: `a global unmount barrier in the test harness` | (**status:** `accepted`)

## Problem Statement

The frontend harness has no barrier between one test's mounted components and
the next test in the same file. Half the mounting suites compensate by hand and
half do not, so whether a suite is isolated is a property of who wrote it. The
class has already produced one ~40% full-suite flake that cost a multi-day
investigation and never reproduced in isolation, and the mechanism guarantees
that any future suite reintroducing it will be reported the same way: as an
intermittent failure in a thirty-minute run, in a file that passes alone.
Grounding, including the measured exposure and the reverse-order hook semantics
this decision depends on, is `2026-09-04-test-isolation-cleanup-research`.

## Considerations

- Teardown must be a property of the harness, not of author memory: a per-suite
  convention that half the suites already miss is not a control.
- The harness runs online against a real engine and must stay that way; nothing
  here may introduce a stub, a mock, or a retry.
- 271 of 499 files run in the node environment and never render. Whatever is
  installed globally has to be inert there.
- `sequence.hooks` resolves to `"stack"`, so hook ordering against the existing
  happy-dom drain in the live-engine setup file is a real constraint, not a
  detail.
- Enabling teardown may unmask suites that pass today only because a previous
  test's component is still mounted. Those are pre-existing defects, and the
  cost of triaging them is part of the price of this decision.

## Considered options

- **`test.globals: true`.** Smallest diff and self-maintaining, since
  `@testing-library/react` then installs its own teardown. REJECTED: the same
  missing global gates a second block that sets `IS_REACT_ACT_ENVIRONMENT`, so
  this change installs teardown AND flips React's act environment for all 499
  files in one move, and additionally publishes the vitest verbs as globals
  across a codebase that imports them explicitly. Two unrelated behaviour
  changes bought for the price of one wanted change is a worse trade than one
  extra file.
- **A setup file registering a global `afterEach(cleanup)`.** CHOSEN. Changes
  exactly the one behaviour, keeps `globals: false`, and is inert where nothing
  mounted. Costs one ordering constraint that has to be written down because it
  is invisible from the setup-file listing.
- **Per-suite `cleanup()` in the remaining 96 suites.** REJECTED: it fixes the
  instances and not the class. Nothing stops the 97th suite from reintroducing
  the defect, and the failure mode it reintroduces is a low-probability flake in
  a long run — the most expensive shape a defect can take. A 96-file diff is
  also a worse review surface than a four-line one for a strictly weaker
  guarantee.
- **Do nothing, and quarantine flakes as they surface.** REJECTED: this is the
  status quo that produced the investigation, and it prices each future
  occurrence at the cost of that investigation.

## Constraints

No frontier or maturity risk. Every dependency is pinned and already in the
tree: `@testing-library/react@16.3.2` and `vitest@4.1.8`. The decision rests on
two implementation details of those pinned versions — the bare-global guard in
RTL's entry module and vitest's default `"stack"` hook ordering — both read from
the installed sources rather than from documentation, both cited in the
grounding research. A major-version bump of either is the event that would
require re-reading them; the guard described below is what would report it.

## Implementation

A second setup file is added to the vitest `setupFiles` list, after the existing
live-engine setup file. It registers one `afterEach` that calls RTL's `cleanup`.
Because vitest runs `afterEach` hooks in reverse registration order, listing it
second makes it run FIRST among the setup-file hooks — so components unmount
before the live-engine file drains and aborts the happy-dom window, which is the
order teardown needs: unmounting is what fires the effect cleanups (aborted
fetches, closed streams) that the drain then settles. The ordering constraint is
recorded at both ends, in the setup file itself and beside the listing.

The 93 suites that already call `cleanup()` keep their calls. Their per-suite
hooks run before the global one, and `cleanup` is idempotent, so they are
harmless; removing them would enlarge a harness-contract diff for no
behavioural gain.

A guard suite proves the barrier FIRES rather than merely exists. It mounts a
component that both writes a marked node into the document and increments a
subscription counter in an effect, then asserts in the NEXT test that the node
is gone and the counter is back to zero. It is validated in both directions:
removing the barrier makes it fail. Asserting only that a hook is registered
would repeat the exact error the grounding investigation made once already.

## Rationale

The chosen option wins on blast radius per unit of guarantee. It buys the same
class-level guarantee as `globals: true` — teardown that no author can forget —
without the act-environment flip and the global verb surface that come bundled
with it, and it buys a guarantee the 96-file sweep cannot offer at all, since
that sweep leaves the next suite free to reintroduce the defect.

The ordering constraint that is its only real cost is settled, not assumed: the
reverse-order semantics are read from the installed runner, and the resulting
sequence is the one teardown wants rather than merely a sequence that works.

## Consequences

Isolation stops being an author responsibility. A suite that mounts components
is unmounted between cases whether or not its author knew to arrange it, and the
`useReducedMotion` flake class cannot recur from a missing per-suite call.

The immediate cost is triage. Any suite that passes today because a previous
test's component is still mounted begins to fail, and each such failure is a
pre-existing defect surfaced, to be fixed on its merits or recorded with
evidence — never by weakening an assertion, adding a retry, or exempting the
file from the barrier without a stated reason.

The residual risk is drift in the pinned dependencies: the barrier's correct
placement depends on vitest's hook ordering staying `"stack"`. The guard suite
covers the observable consequence (a component unmounted between cases) but not
the ordering against the happy-dom drain, which remains reasoned rather than
asserted. A vitest major bump should re-read that default.

This record deliberately does not settle the act environment. The same missing
global leaves `IS_REACT_ACT_ENVIRONMENT` unset repo-wide, which may be hiding
un-acted state updates. That is a real second consequence of the same cause, with
its own blast radius, and belongs in its own decision.
