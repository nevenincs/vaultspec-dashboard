---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S14'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Broker bounded authenticated liveness, readiness, drain, shutdown, and lifecycle-entrypoint calls through the capsule contract

## Scope

- `engine/crates/vaultspec-product/src/control.rs`

## Description

- Add `control.rs` with `ControlClient` brokering liveness, readiness, drain,
  shutdown, and lifecycle-entrypoint calls to the owned gateway.
- Implement a minimal, dependency-free HTTP/1.1 client over `std::net` using
  `Connection: close`, bounded by a connect timeout, a read/write timeout, and a
  hard response byte cap; every breach fails typed (`Timeout` / `TooLarge`),
  never hangs or exhausts memory.
- Attach the attach-control bearer on every call and the ownership capability on
  the receipt-bound shutdown/lifecycle calls; refuse a non-loopback endpoint
  before opening a socket.

## Outcome

Against a real loopback stub, the client sends the bearer, parses the one
readiness model, carries the ownership capability on shutdown, types a 401 as
`Unauthorized`, trips its read timeout on a silent server, trips its byte cap on
a flood, and refuses a non-loopback endpoint.

## Notes

No HTTP framework was added; the transport is `std::net` only, matching the
crate's dependency-free posture. The gateway control endpoints are a loopback
JSON contract, so `Connection: close` bounds the body without chunked handling.
