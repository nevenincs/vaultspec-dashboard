---
name: subprocess-calls-carry-cap-and-timeout
---

# Every subprocess call carries an output cap AND a wall-clock timeout

## Rule

Every external process the engine spawns (the `vaultspec-core`, `git`, and
`vaultspec-rag` siblings, on every path — serve and CLI) must enforce BOTH an
output byte cap AND a wall-clock timeout at the call site, and must kill the
child when either is exceeded. A subprocess with only one of the two, or with
neither, is a defect.

## Why

The engine is read-and-infer over siblings it does not control, so a sibling
that streams unboundedly or hangs must not take the engine down with it. The
byte cap alone shipped first (`run_json` stdout ceiling, robustness H1) but the
matching wall-clock timeout was deferred — and the `resource-hardening` audit
found the cost: a hung `vaultspec-core` (locked venv, stalled import) pinned a
Tokio blocking-pool thread indefinitely, and combined with an unbounded rebuild
channel could saturate the whole pool and hang the service. The two guards are
complementary: the cap bounds a chatty child, the timeout bounds a stuck one;
either alone leaves a live exhaustion path. The async `/ops` proxy already
carried both, which is exactly why it never exhibited the hang — the rule
generalizes that discipline to every spawn.

## How

- **Good:** `run_json` reads stdout under a byte ceiling on a worker thread and
  the parent enforces a deadline via `recv_timeout`, killing the child on either
  breach and returning a typed `Timeout`/`OutputTooLarge` error. New spawn sites
  inherit the same shape (or wrap the async call in `tokio::time::timeout`).
- **Bad:** `child.stdout.read_to_end(...)` with no deadline (hangs forever on a
  stalled child), or a timeout with no byte cap (OOMs on a runaway one). Both are
  the failure modes this rule closes.

## Status

Active. Promoted from the `resource-hardening` wave of the
`2026-06-15-performance-sweep` campaign after the missing-timeout half of an
already-capped subprocess path caused the engine crash/hang investigated there;
the cap-and-timeout pairing had already held on the `/ops` proxy across the
production-hardening cycle.

## Source

ADR `2026-06-15-resource-hardening-adr` and research
`2026-06-15-resource-hardening-research` (findings B1, B2). Sibling rules
`bounded-by-default-for-every-accumulator`, `engine-read-and-infer`.
