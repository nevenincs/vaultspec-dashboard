---
tags:
  - '#audit'
  - '#a2a-orchestration-edge'
date: '2026-08-02'
modified: '2026-09-03'
body_schema: 'body-v1'
body_hash: 'sha256:33f3920f52bdcd49f9ad8beb9430963351d9650036527c9b5ebc51b0cfed25c6'
related:
  - "[[2026-08-02-a2a-orchestration-edge-provider-catalog-inversion-audit]]"
  - "[[2026-07-14-a2a-orchestration-edge-adr]]"
---

# `a2a-orchestration-edge` audit: `how a total run-start outage sat green`

## Scope

Requested by the run-start ruling as prevention work worth more than the fix it
accompanied: how did a change that broke every brokered run-start sit green from
its landing until an audit found it by reading both repositories? This document
names the verification gaps that made it possible, with the corroborating
instances observed the same day, and proposes gate changes for their owners to
decide. Nothing here is implemented: the gate and harness belong to every lane's
test loop and are not changed unilaterally.

## Findings

### stale-engine-false-green | high | engine edge changes land without any live test against a rebuilt engine

The frontend a2a live suites run against a PREBUILT engine binary that
`cargo test` never rebuilds, and the engine's own crate tests exercise the
forwarded-call builders without a sibling round trip. An engine change under
`engine/crates/vaultspec-api/src/routes/ops/` can therefore land with every
gate green while the served behaviour is broken end to end: the run-start
outage (see the provider-catalog inversion audit) sat green precisely this way
- the crate tests asserted the new mandatory selection was enforced, and
nothing anywhere started a run against the sibling that refuses it. The
repository already carries the memory that a stale live-engine binary is a
false RED; this is the same mechanism producing a false GREEN, which is worse,
because red gets investigated and green gets built upon.

### shared-state-false-green | medium | shared build state can revalidate a change that is no longer there

Two corroborating same-day instances from the remediation itself, recorded so
the class is named rather than the anecdotes: a test run against the shared
`CARGO_TARGET_DIR` reported 111 passing a2a tests for a tree whose relevant
source had been rewritten seconds earlier (stale fingerprint served a binary
compiled from the pre-rewrite source), and a backgrounded proof piped through
`tail` reported exit 0 for a build that failed to compile (the exit code was
the pipe's, not cargo's). Both greens were false; an isolated `git worktree`
with an isolated target directory and an explicitly captured exit code told
the truth both times.

### record-code-divergence-unguarded | medium | nothing ties the edge record's verb and requiredness table to the code

The whitelist gained its eighth verb and run-start's required body hardened
with no amendment on the edge record - code and record disagreed for hours and
only a human read found it. A guard could have caught it mechanically, but not
against the record as written: the ADR's verb inventory lives in an amendment
prose trail no test can parse reliably. It becomes mechanizable through one
indirection - a small checked-in machine-readable table (verbs, and per-verb
required body keys) that the ADR cites as its normative inventory and a test
asserts against both `A2A_WHITELIST` and the validators' requiredness. Without
that table the check stays a human read at review time; with it, adding a verb
or hardening a body without touching the cited table fails a test. The
admitted-keys pin that landed with the run-start fix is the first third of
that table (the outbound key sets); the verb list and requiredness columns are
the remainder.

## Recommendations

For the gate owner: run the frontend a2a live suite in the gate for changes
under the engine's a2a route paths, against an engine binary REBUILT from the
changed source - and have the live harness refuse to run against an engine
binary older than the newest engine source it is supposed to prove, so the
stale-binary class dies for red and green alike. Both touch every lane's test
loop and are proposed here, not implemented.

For the edge's owners: decide whether to introduce the machine-readable
verb/requiredness table the third finding describes, extending the landed
admitted-keys pin into the full record-to-code guard; if declined, the check
remains a review-time human read and this record is the reminder of its cost.

For every lane, already actionable without anyone's decision: prove a commit
in an isolated worktree with an isolated target directory, and never accept an
exit code that passed through a pipe.
