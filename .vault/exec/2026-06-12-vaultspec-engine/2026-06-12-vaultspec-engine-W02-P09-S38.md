---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S38'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement rag service discovery via service json and the bearer loopback HTTP client with truthful absent and down states

## Scope

- `engine/crates/rag-client/src/client.rs`

## Description

- Implement rag service discovery via the service-json file at the rag data directory: missing or unreadable discovery is the truthful 'absent' availability state, never an error (D5.2 - everything else functions without rag).
- Implement the loopback HTTP/1.1 transport over plain TCP with bearer authorization and content-length framing, behind a pluggable transport trait; verified against an in-test TCP server.

## Outcome

Rag is consumed via its resident loopback HTTP service only - never Python import, never bundled; the wheel's torch-free guarantee untouched.

## Notes

Deliberate dependency call: no HTTP client crate - the service is loopback-only JSON with content-length framing, so a minimal in-crate transport (~40 lines) beats adding reqwest/hyper for the engine's only OPTIONAL integration. Flagged for phase review.
