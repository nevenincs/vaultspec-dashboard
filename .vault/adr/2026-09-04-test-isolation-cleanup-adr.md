---
tags:
  - '#adr'
  - '#test-isolation-cleanup'
date: '2026-09-04'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:b45dd1ccaf99b4e88867c5be712910d441dd20853a169c4dd0bdbe223792ec2b'
related:
  - "[[2026-09-04-test-isolation-cleanup-research]]"
---

# `test-isolation-cleanup` adr: `a global unmount barrier with runner-owned window teardown` | (**status:** `accepted`)

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

Implementation evidence in `2026-09-04-test-isolation-cleanup-research`
disproved awaited window abort as a safe per-test settlement mechanism:
window-wide abort is destructive environment teardown. The harness must therefore
stop owning window destruction between tests rather than suppress, retry, or
normalize the diagnostics it creates.

The first bounded run after that removal confirms the ownership change and exposes
the next boundary: the remaining abort/reset output originates during Vitest's
file teardown, not the removed application hook. The exact evidence and candidate
owners remain grounded in the linked research.

## Considerations

- Teardown must be a property of the harness, not of author memory: a per-suite
  convention that half the suites already miss is not a control.
- The harness runs online against a real engine and must stay that way; nothing
  here may introduce a stub, a mock, or a retry.
- 271 of 499 files run in the node environment and never render. Whatever is
  installed globally has to be inert there.
- `sequence.hooks` resolves to `"stack"`, so the global cleanup hook's ordering
  against per-suite hooks is a real constraint, not a detail. No application
  setup hook may compete with the runner for environment teardown.
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
- **Remove the RTL per-test unmount barrier and rely only on Vitest's file
  teardown.** REJECTED. File teardown cannot prevent a mounted component from
  leaking state and subscriptions into the next test in the same file.
- **Unmount, immediately abort pending happy-dom tasks, and await abort
  completion.** REJECTED AFTER EXECUTION. Awaiting makes the promise ordering
  honest, but abort still destroys every active happy-dom request and response.
  Full-suite timing evidence showed that repeated mid-file cancellation emits
  synchronous AbortError stacks and socket resets even when tests, the worker, and
  the engine remain healthy.
- **Unmount between tests and reserve window abort for Vitest's file teardown.**
  CHOSEN. RTL cleanup remains the global per-test barrier. Vitest retains sole
  ownership of happy-dom environment destruction at file end, where it already
  awaits native abort. Any async operation that must settle or cancel earlier is
  repaired at the component, query, transport, or test that created it.
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
second keeps the global component barrier after each suite's own teardown hooks.
The live-engine setup file registers no competing afterEach lifecycle hook, and
happy-dom environment teardown occurs only after file hooks complete under
Vitest's ownership.

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

The live setup file binds the shared clients and registers no happy-dom lifecycle
hook. Per-test global teardown ends after RTL unmount. The helper and guard that
encoded per-test window abort are removed with that ownership path; they are not
retained as an unused compatibility surface.

Vitest's happy-dom environment teardown is the sole owner of window-wide abort and
awaits it at file end. A replacement behavioral guard spies on the live
environment capability across two tests and proves no per-test hook calls it. The
guard is demonstrated red by temporarily restoring the removed hook. The existing
cross-test RTL cleanup guard continues to prove that component unmount still fires.

If removal exposes work that survives component unmount and affects a later test,
that work is traced to its actual component, query client, transport, or test
owner, then awaited or cancelled there. A generic drain, window abort, diagnostic
filter, retry, timeout increase, or exception swallow is not an admissible repair.

The bounded prefix is first an attribution action and then an acceptance gate.
Completing its first diagnostic execution records the red result and candidate
owners without asserting plan completion. Before the full-suite gate, the
candidate files execute once each in isolation, only the mechanically demonstrated
owner is repaired, and the exact prefix must then satisfy the zero-diagnostic
threshold. An inconclusive candidate run stops for a plan amendment rather than
expanding the repair scope ad hoc.

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

One lifecycle owner per boundary is the smallest complete correction. RTL owns
component unmount between tests; application and test code own the operations they
start; Vitest owns environment destruction after the file. Reusing Vitest's
file-destruction primitive inside every test collapses those boundaries and creates
the very cross-test diagnostics the barrier is intended to prevent.

## Consequences

Isolation stops being an author responsibility. A suite that mounts components
is unmounted between cases whether or not its author knew to arrange it, and the
`useReducedMotion` flake class cannot recur from a missing per-suite call.

The immediate cost is triage. Any suite that passes today because a previous
test's component is still mounted begins to fail, and each such failure is a
pre-existing defect surfaced, to be fixed on its merits or recorded with
evidence — never by weakening an assertion, adding a retry, or exempting the
file from the barrier without a stated reason.

The residual risk is drift in the pinned dependencies: the unmount barrier's
placement depends on vitest's hook ordering staying `"stack"`, and file-end window
destruction remains runner-owned. The guards cover both observable consequences:
components are unmounted between cases and happy-dom abort is not called between
them. A Vitest or happy-dom major bump should re-read both contracts.

This record deliberately does not settle the act environment. The same missing
global leaves `IS_REACT_ACT_ENVIRONMENT` unset repo-wide, which may be hiding
un-acted state updates. That is a real second consequence of the same cause, with
its own blast radius, and belongs in its own decision.

Per-test teardown becomes non-destructive: components unmount, but the harness does
not tear down their entire window or sockets. File-end happy-dom teardown remains
awaited by Vitest. The suite pays no fixed drain and no longer manufactures
mid-file AbortError or ECONNRESET bursts.

The suite remains deliberately serial. The performance gain comes from removing
repeated dead time and destructive cancellation, not from introducing unsafe
concurrency.

Completion requires both serialized full-suite runs to emit no synchronous
`AbortError` stacks, no `socket hang up` or `ECONNRESET` diagnostics, no
unhandled-error section, no worker exit, and no unexpected engine exit. A zero
exit code does not waive these diagnostic conditions.

Removing the global abort can reveal an operation whose owner failed to cancel or
await it. That is an ownership defect to repair at its source, never evidence for
restoring a window-wide per-test hook or suppressing its diagnostics.

An evidence-producing Step may close with a red gate when its stated output is the
failure enumeration that authorizes the next repair Step. That closure never
changes the acceptance state: `S15` owns clearing the bounded zero-diagnostic
barrier before `S10` can begin.

A deterministic pure-test failure is never classified as an engine-port failure
merely because the engine also died during the run. Infrastructure classification
requires a demonstrated dependency path to the failed service or a worker/process
failure that can affect that file.
