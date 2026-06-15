---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S06'
related:
  - "[[2026-06-13-vaultspec-engine-plan]]"
---




# Add a consumer-shaped conformance test asserting the typed-client expectations for every contract capability over live serve responses

## Scope

- `engine/tests/tests/conformance.rs`

## Description

- Add a consumer-shaped typed-client test over live `vaultspec serve`, with a
  two-commit vault-plus-code fixture (features, titles, dates, a code mention).
- Assert all five S49 divergences in one test: ms timestamps on asof/diff with
  the revision form still accepted; feature-node synthesis with
  member_count/degree/meta-edge ids; section 4 list fields; the `/status` git
  block plus `/vault-tree` dates and doc_type; bounded commit-event node_ids.

## Outcome

Written failing-first against the closed implementation, now green after
S01-S05. The leg institutionalizes catching the next contract drift engine-side
before a client does.

## Notes

The test binds fixed port 8831 (consistent with the e2e suite's 8821/8822);
concurrent runs on the same port collide - the ephemeral-port fix is recorded
backlog. The plan row named the file `e2e.rs`; the shipped artifact is the
sibling `conformance.rs` test crate, kept separate from the parity e2e suite so
the consumer-typed-client leg reads as its own surface.

