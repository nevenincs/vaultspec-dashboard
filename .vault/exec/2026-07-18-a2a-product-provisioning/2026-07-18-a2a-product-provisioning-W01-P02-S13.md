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

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace a2a-product-provisioning with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S13 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Validate secret-free versioned A2A discovery, live process identity, owner handoff reference, freshness, compatibility, and foreign immutability and ## Scope

- `engine/crates/vaultspec-product/src/discovery.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
