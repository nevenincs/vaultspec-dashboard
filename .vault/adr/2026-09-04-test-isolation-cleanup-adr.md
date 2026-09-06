---
tags:
  - '#adr'
  - '#test-isolation-cleanup'
date: '2026-09-04'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:98371584f2dee8867b2cf8b34358b6282ab48df595c9f4268ecb1ff51133f09c'
related:
  - "[[2026-09-04-test-isolation-cleanup-research]]"
---

# `test-isolation-cleanup` adr: `an awaited global unmount and async-task barrier` | (**status:** `accepted`)

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

The unmount barrier is correct, but its adjacent happy-dom settlement barrier is
not. The harness waits for pending tasks for up to one second after every
happy-dom test and then invokes the asynchronous abort operation without awaiting
it. Across roughly nineteen hundred happy-dom cases, the fixed per-test drain
dominates suite duration, while the dropped abort promise permits its rejection or
final microtasks to escape the owning test. The suite is already file-serial
against one mutable engine, so the former parallel-sibling justification and the
configured four-worker claim do not describe the runtime that actually executes.

## Considerations

- Teardown must be a property of the harness, not of author memory: a per-suite
  convention that half the suites already miss is not a control.
- The harness runs online against a real engine and must stay that way; nothing
  here may introduce a stub, a mock, or a retry.
- 271 of 499 files run in the node environment and never render. Whatever is
  installed globally has to be inert there.
- `sequence.hooks` resolves to `"stack"`, so hook ordering against the awaited
  happy-dom abort in the live-engine setup file is a real constraint, not a
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

For asynchronous happy-dom settlement:

- **Keep `waitUntilComplete`, then await `abort`.** REJECTED. It repairs the
  dropped promise but preserves the one-second-per-test amplification and waits
  for work that the following abort is specifically responsible for cancelling.
- **Remove the per-test barrier and rely only on Vitest's file teardown.**
  REJECTED. Vitest correctly awaits abort at file end, but this permits async work
  from one test to enter the next test in the same file.
- **Unmount, immediately abort pending happy-dom tasks, and await abort
  completion.** CHOSEN. RTL cleanup runs first; the next hook calls and awaits
  happy-dom's native asynchronous abort, which already cancels tasks and settles
  their microtasks. This preserves the between-test barrier without the fixed
  drain.
- **Restore file parallelism to make `maxWorkers: 4` effective.** REJECTED. All
  files share one mutable live engine; file serialization remains the determinism
  boundary.

## Constraints

No frontier or maturity risk. Every dependency is pinned and already in the
tree: `@testing-library/react@16.3.2`, `vitest@5.0.0`, and
`happy-dom@20.10.2`. The decision rests on implementation details of those
pinned versions — the bare-global guard in RTL's entry module, Vitest's default
`"stack"` hook ordering, and happy-dom's asynchronous abort contract — all read
from the installed sources and cited in the grounding research. A major-version
bump is the event that requires re-reading them; the guards described below are
what report behavioral drift.

## Implementation

A second setup file is added to the vitest `setupFiles` list, after the existing
live-engine setup file. It registers one `afterEach` that calls RTL's `cleanup`.
Because vitest runs `afterEach` hooks in reverse registration order, listing it
second makes it run FIRST among the setup-file hooks — so components unmount
before the live-engine file aborts the happy-dom window. Unmounting fires effect
cleanup first; the adjacent barrier then owns cancellation and final settlement.
The ordering constraint is recorded at both ends, in the setup file itself and
beside the listing.

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

The live setup hook calls happy-dom's asynchronous `abort()` directly and awaits
its returned promise. It does not call `waitUntilComplete`, race against a fixed
timer, suppress abort rejection, or type the operation as returning `void`.

The abort operation is represented by a narrow typed helper whose contract is
`abort(): Promise<void>`. A focused guard supplies a deferred abort promise and
proves that the helper does not resolve before that promise; it also proves
rejection propagation and proves that no timer-based wait is scheduled. The
existing cross-test RTL cleanup guard remains unchanged.

Files remain serial against the one shared engine. Configuration states that
truth directly: retain `fileParallelism: false` and set `maxWorkers: 1`, removing
the obsolete claim that four workers improved this suite. Unexpected engine exit
diagnostics remain bounded to exit code, signal, elapsed runtime, and the serve-log
tail; they add no retry or per-test logging.

## Rationale

The chosen option wins on blast radius per unit of guarantee. It buys the same
class-level guarantee as `globals: true` — teardown that no author can forget —
without the act-environment flip and the global verb surface that come bundled
with it, and it buys a guarantee the 96-file sweep cannot offer at all, since
that sweep leaves the next suite free to reintroduce the defect.

The ordering constraint that is its only real cost is settled, not assumed: the
reverse-order semantics are read from the installed runner, and the resulting
sequence is the one teardown wants rather than merely a sequence that works.

Awaiting native abort is the smallest complete settlement mechanism: it owns the
same cancellation boundary Vitest uses at file teardown, keeps failures attached
to the test that created the work, and removes the fixed pre-abort delay without
introducing concurrency, retries, or a second lifecycle owner.

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
the ordering against the awaited happy-dom abort, which remains reasoned rather
than asserted. A vitest major bump should re-read that default.

This record deliberately does not settle the act environment. The same missing
global leaves `IS_REACT_ACT_ENVIRONMENT` unset repo-wide, which may be hiding
un-acted state updates. That is a real second consequence of the same cause, with
its own blast radius, and belongs in its own decision.

Happy-dom teardown becomes deterministic and attributable: each test waits for
cancellation completion, but no test pays a fixed one-second drain. Abort failures
remain visible in the owning test instead of escaping as later `AbortError`,
`ECONNRESET`, or unrelated-file noise.

The suite remains deliberately serial. The performance gain comes from removing
repeated dead time, not from introducing unsafe concurrency.

A deterministic pure-test failure is never classified as an engine-port failure
merely because the engine also died during the run. Infrastructure classification
requires a demonstrated dependency path to the failed service or a worker/process
failure that can affect that file.
