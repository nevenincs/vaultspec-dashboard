---
tags:
  - '#audit'
  - '#test-isolation-cleanup'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:36800bd060de466905c06022abfda730211669ab5679c9d2abcbc36a02db5ad0'
related:
  - "[[2026-09-04-test-isolation-cleanup-plan]]"
---

# `test-isolation-cleanup` audit: `S18 Node HTTP transport review`

## Scope

Reviewed exact Step `W02.P01.S18`: the bounded test-only Node HTTP/HTTPS
transport, shared live-client routing, real-server contract tests, mutation
sensitivity, socket and listener ownership, exact failure identity, and the
unchanged direct-global-fetch conformance boundary. Paused S17 work was outside
the review and remained untouched.

## Findings

### s18-socket-close | high | Socket destruction was initially treated as actual closure

The initial implementation allowed the request `close` path to settle when its
socket reported `destroyed`, even though Node sets that flag before the actual
socket `close` event. The transport now settles an assigned socket only from
that event. A controlled real-socket regression holds the event, emits request
close after destruction, and requires reader cancellation to remain pending.
Restoring the destroyed-as-closed condition made the regression fail before the
event was released; the corrected path passes.

### s18-null-body-abort | high | Null-body responses ignored abort after headers

HEAD, 204, and 304 handling originally marked the response terminal while it
was still draining and waiting for socket close, but installed no effective
post-header abort owner. The null-body path now retains one outcome through
actual close: response end may begin settlement, while a later owner abort wins
with the exact `signal.reason`, destroys owned resources, and removes its Node
listeners. Held-end real-server cases for HEAD/200, GET/204, and GET/304 prove
the correction and transport-owned listener deltas.

### s18-terminal-proof | high | Initial tests did not cover every terminal ownership contract

The contract suite now proves invalid requests reject asynchronously before any
socket opens; abort and real request failure remove a pending drain listener;
response and connection failures retain the original object identity; response,
request, signal, and drain listeners are removed; and sequential calls use two
distinct non-pooled sockets with both actually closed. Tests also cover
headers-first streaming, desired-size pause and pull resume, null bodies,
manual redirects, strict TLS, and exact pre-header and post-header abort reasons.
Mutations restoring ambient fetch, ending before drain, omitting response pause,
and settling from socket destruction each failed their direct assertion before
restoration.

### s18-live-transport-promise | medium | Header construction could escape synchronously

`liveTransport` initially constructed `Headers` in a non-async wrapper, so a
malformed but type-valid `HeadersInit` could throw before returning its FetchLike
Promise. The wrapper is now async and delegates with `await`; a throwing Proxy
fixture proves the original error is delivered as a rejected Promise rather
than a synchronous exception.

## Recommendations

Accept S18. The final real-server transport suite passed 44 of 44 tests without
unhandled diagnostics, the unchanged engine-conformance suite passed 9 of 9,
standalone TypeScript checking passed, and the complete frontend lint recipe
exited zero. Independent Sol re-review returned terminal PASS with no remaining
findings. Resume the separately owned S17 gate only through its explicit plan
Step; S18 makes no claim about S17 or the later integration barrier.

Status: PASS.
