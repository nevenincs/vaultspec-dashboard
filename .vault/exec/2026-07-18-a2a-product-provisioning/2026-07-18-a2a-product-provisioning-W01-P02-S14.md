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

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace a2a-product-provisioning with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S14 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Broker bounded authenticated liveness, readiness, drain, shutdown, and lifecycle-entrypoint calls through the capsule contract and ## Scope

- `engine/crates/vaultspec-product/src/control.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
