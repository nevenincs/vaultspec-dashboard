---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-30'
modified: '2026-07-30'
body_schema: 'body-v1'
body_hash: 'sha256:911bd2116cc645217edbf55d164d31e3d708ab7cde66e447f57a990b805d7a1e'
step_id: 'S182'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# L3a engine-serve socket stability. Resolve the defect where live serve drops in-flight connections under the loaded frontend live-vitest suite (watcher rebuild-swap dropping sockets) so the suite sees no socket hang up. Verify the frontend live-vitest suite completes with zero socket hang up on the runner

## Scope

- `engine/crates/vaultspec-api/src/app.rs`

## Description

- Reproduce the reported symptom from the server side with a probe that drives the
  real router over real loopback sockets, isolating two candidate mechanisms: a
  rebuild-and-swap storm racing live keep-alive connections, and a stop that cannot
  drain.
- Clear the first mechanism empirically: 66 rebuild-swap commits (diff, clock
  advance, broadcast, graph swap, generation bump, projection warm) landed under 480
  in-flight keep-alive requests across 8 connections with zero drops, so the swap
  itself is not the socket killer.
- Confirm the second: a graceful stop with ONE open live stream never completed, so
  every stop degenerates into the caller's force-kill, and a kill resets whatever
  connections are still attached.
- Replace the serve state's one-shot shutdown notification with a latch whose
  waiters resolve even when created after the raise, so a streaming response body
  opened at any moment can observe the stop.
- End both endless server-sent-event bodies (the graph stream and the run relay) on
  that latch, so their chunked bodies terminate cleanly instead of holding their
  connections open through the drain.
- Bound the drain itself: after the latch, allow one grace window for in-flight work
  and then exit, so a peer that stops reading cannot hang a stop and force the caller
  to escalate.
- Ship the probe as a regression test over real sockets, plus a unit test pinning the
  latch semantics the previous primitive lacked.

## Outcome

The stop now drains with a live stream open, and the stream body ends with a proper
chunked terminator rather than a truncated read. Gates: workspace `cargo fmt --check`
exit 0; `cargo clippy --all-targets -D warnings` over the changed crate exit 0;
`cargo test` over the changed crate exit 0 with 968 tests passing. The workspace-wide
clippy run is red in a DIFFERENT crate that a parallel lane is mid-refactor on; no
diagnostic falls in a file changed here.

Claim scope, stated exactly. Two things are proven by execution, not argument. First,
the mechanism the Step names in its parenthetical — a watcher rebuild-and-swap
dropping sockets — is NOT a socket killer: under continuous swaps the served router
answered every one of 480 requests across eight live keep-alive connections, and that
held before the change as well as after. Second, the mechanism that IS real: a stop
could not converge while a live stream was open, so it ended in the caller's kill and
the kill reset whatever was attached. That one failed as a test before the change and
passes after, with the stream body ending on a proper chunked terminator.

What is NOT claimed: an observation of the browser test suite itself. It cannot start
on this host, so if a further contributor to the reported symptom lives on the client
side or in runner resource pressure, this change would not have reached it.

## Notes

- The workspace tree was mid-refactor in a parallel lane throughout, so the crate
  under change could not be compiled for long stretches; the fix was verified as soon
  as the shared tree compiled again.
- The change set was swept into a parallel lane's commit before this lane could
  commit it, so the engine change does not carry its own commit message. The content
  at that commit is byte-identical to what the gates above were run against.
- A local reproduction of the loaded browser-suite path is unavailable on this
  machine: the frontend dependency tree was installed for a different platform and
  the runner cannot start.
- Residual risk, stated plainly: the reported symptom may also carry client-side
  teardown races or runner resource starvation. Those cannot be observed from here,
  and this change removes only the server-side mechanism — which was real,
  reproducible, and independently a product defect on the stop path.
- Process exit still waits on any rebuild already running on a blocking thread, which
  is sub-second on a fixture corpus but grows with the corpus.
