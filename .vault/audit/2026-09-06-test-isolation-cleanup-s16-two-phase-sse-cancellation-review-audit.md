---
tags:
  - '#audit'
  - '#test-isolation-cleanup'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:62f0179b2dffa553c84f5e5b3ffd48676f3164765e2b8d8458a725cf8f9b8483'
related:
  - "[[2026-09-04-test-isolation-cleanup-plan]]"
---

# `test-isolation-cleanup` audit: `S16 two-phase SSE cancellation review`

## Scope

Reviewed exact plan Step `W02.P01.S16`: the shared two-phase SSE cancellation
contract, its engine, A2A relay, and authoring lifecycle owners, focused tests,
mutation sensitivity, resource bounds, type safety, and the complete frontend
lint gate. The review specifically checked that acquisition cancellation and
response-reader cancellation remain separate ownership phases.

## Findings

### s16-cancellation-reactions | high | Per-read cancellation races retained unbounded promise reactions

The initial reader loop raced every `reader.read()` against one never-settled
cancellation promise. Each winning read left another losing reaction attached
until owner abort, so a long-lived stream retained work proportional to its read
count. The implementation was replaced by one cached cancellation outcome and a
direct `reader.read()` loop. A controlled-reader test consumes 1,024 frames and
requires zero helper-owned `Promise.race` calls. Temporarily restoring a
per-read race made that test fail with 1,025 observed calls; restoring the
constant-space loop returned the focused suite to green.

### s16-foreign-abort-classification | medium | A non-owner AbortError could be mistaken for normal owner cancellation

The first implementation could complete normally for an `AbortError` raised by
the transport even when the owner signal had not cancelled. The catch path now
recognizes normal completion only through the helper's owned cancellation
state; foreign read failures, including foreign `AbortError`, retain the
established `StreamLostError` contract. Focused regression coverage passes.

### s16-listener-removal-proof | medium | The original late-abort assertion did not prove reader-listener removal

Calling `reader.cancel()` twice on an already-cancelled native stream did not
reinvoke its underlying source cancellation, so the original count-only test
could stay green while retaining the owner-signal-to-reader closure. The test
now records both acquisition and reader abort-listener identities and requires
each identity to be removed. Temporarily deleting the reader-phase removal made
the test fail with only the acquisition listener present in removal calls; the
restored implementation passes.

### s16-buffered-frame-cancellation | medium | Parsed frames buffered behind a yielded frame could escape after cancellation

The reader checked cancellation between reads but initially yielded every frame
parsed from one chunk without rechecking. If a consumer paused after frame one
and then cancelled, frame two could still be delivered on the next iteration.
The inner frame loop now checks the same constant-space cancellation state
before every yield and awaits the visible cancellation outcome before return.
A two-frame single-chunk test fails by receiving sequence two when that check is
removed and passes after restoration.

### s16-relay-contract-doc | low | Relay documentation described the obsolete Response input

`relayFrames` now consumes decoded `AsyncIterable<StreamChunk>` values, but its
comment still claimed it adapted an SSE `Response`. The comment was corrected
to match the routed helper boundary.

### s16-required-mutations | medium | Phase-boundary ownership needed direct mutation evidence

Retaining the acquisition abort bridge after headers made two post-header tests
fail because the private request signal was aborted. Restoring direct owner
signal forwarding in authoring made the last-subscriber behavior test time out
because no response-reader owner remained. Both mutations were restored before
the final gates. Together with the resource-bound, listener-removal, and
buffered-frame mutations above, these failures prove the tests exercise the
intended boundary rather than only its nominal output.

## Recommendations

Accept S16. The final focused run passed 65 of 65 tests, standalone TypeScript
checking passed, and `just lint frontend` exited zero. Independent Sol re-review
returned terminal PASS with no remaining findings. Keep S15 closed until it is
explicitly routed; S16 does not claim the real-engine prefix barrier.

Status: PASS.
