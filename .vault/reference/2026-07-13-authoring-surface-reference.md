---
tags:
  - '#reference'
  - '#authoring-surface'
date: '2026-07-13'
modified: '2026-07-13'
related:
  - "[[2026-07-12-authoring-surface-adr]]"
---

# `authoring-surface` reference: `cross-boundary contracts and upstream coordination asks`

Durable implementation contracts the epic created that cross a repository or
module boundary, plus the coordination asks it leaves open toward the external
`vaultspec-core` project. Consulted sources: the epic's execution records and
review verdicts, the core adapter and rollback modules in the engine, and the
reader anchor implementation.

## Summary

### Upstream ask (Tier-3, toward vaultspec-core): expected-blob-hash fence on plan verbs

`vault plan step check|uncheck` accepts no `--expected-blob-hash`, unlike the
write verbs every other ledgered operation invokes (`set-body`,
`set-frontmatter`, `edit`, `rename` all accept the fence, and core rejects a
stale base atomically at write time). The plan-tick capability therefore
enforces optimistic concurrency ENGINE-side only: the direct-write stale-base
pre-check plus the apply preflight conflict re-check, leaving the stated
preflight-to-invoke race window that the core-authoritative post-verify
resolves fail-closed. This is the accepted, documented weaker guarantee in the
same-feature adr. The ask to file toward the core project: accept
`--expected-blob-hash <oid>` on `vault plan step check|uncheck|toggle`
(refusing with the same stale-base envelope the write verbs use) so the
engine's fence can retire and plan ticks gain the identical atomic guarantee
as every other ledgered write. Until it lands, the engine-side fence is the
canonical substitute and MUST NOT be weakened; this gap is a coordination
filing, never something to patch around with raw file reads.

### Rollback preimage coupling (engine-internal, guards a future exemption)

The plan-tick rollback inverse (a state flip in `rollback_inverses.rs`) never
consumes the source changeset's whole-document preimage, but eligibility still
requires the preimage to be present, because the shared `generate_rollback`
path unconditionally unwraps it for every invertible kind. Consequence: a
plan-tick source whose preimage aged out of retention is denied rollback
(fail-closed, honest, never wrong). Any future change that exempts plan ticks
from the preimage requirement MUST also make that shared unwrap conditional or
a preimage-less plan-tick rollback panics — the coupling is commented at the
unwrap site in `rollback.rs`.

### Client-side section anchor hash mirrors the engine byte-for-byte

New comments compute their section selector's expected content hash CLIENT-side
(`frontend/src/app/viewer/sectionAnchor.ts`): git blob object id
(`sha1("blob " + len + NUL + bytes)`) over the section bytes from the heading
line through the next same-or-shallower heading, with delimiter-matched fence
tracking, ATX-only — mirroring `ingest_struct` section parsing and `blob_oid`
exactly. Both sides read the same raw worktree bytes with no line-ending or
trailing-newline normalization, so CRLF, BOM, and no-trailing-newline classes
all agree (review-verified; a live test proves a compose-path selector lists
as anchored over the real wire). MAINTENANCE LAW: any change to the engine's
section parsing or hashing must update the client mirror in the same change,
or every newly created comment is born orphaned. Known accepted divergences:
documents beyond the served content byte cap can orphan tail-section comments
(truncation is surfaced), and duplicate full heading paths refuse compose with
a hint instead of creating an ambiguous anchor.

### Section-link identity is single-sourced

Heading slugs are stamped once by the reader's block-identity remark plugin
(occurrence-disambiguated), and every consumer — the comment affordance, the
copy-section-link verb, the scroll-to-fragment intent, and the wiki-link
resolver's fragment split — resolves through that one identity. Never add a
second slugger; a copied link must round-trip through the resolver.
