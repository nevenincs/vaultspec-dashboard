---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S13'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---




# Validate secret-free versioned A2A discovery, live process identity, owner handoff reference, freshness, compatibility, and foreign immutability

## Scope

- `engine/crates/vaultspec-product/src/discovery.rs`

## Description

- Add `discovery.rs` with the secret-free `GatewayDiscovery` record (endpoint,
  pid, owner, install identity, generation, release set, protocol/state ranges,
  non-secret handoff reference, heartbeat).
- Reject any secret-bearing record: scan raw JSON keys for a forbidden-key set
  (`service_token`, `bearer`, `token`, `credential`, ...) before structural parse.
- Classify the attach/ownership decision from live process identity
  (`process_is_alive`), heartbeat freshness, protocol/state compatibility, owner
  match, and a readable trusted handoff, yielding `OwnedLive`, `OwnedStale`,
  `ForeignAttachable`, or `ForeignImmutable { reason }`.

## Outcome

A secret-bearing discovery is refused outright; an owned live/fresh/compatible
gateway is `OwnedLive`; a stale owned gateway is a quarantine candidate; a live
foreign gateway is immutable and attachable read-only only with a trusted
handoff.

## Notes

None.
