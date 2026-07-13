---
tags:
  - '#adr'
  - '#rag-schema-gate'
date: '2026-06-27'
modified: '2026-07-12'
related:
  - "[[2026-06-27-rag-schema-gate-research]]"
---

# `rag-schema-gate` adr: `gate the direct-Qdrant embedding read on rag's storage-schema contract` | (**status:** `accepted`)

## Problem Statement

The engine reads embeddings DIRECTLY from rag's Qdrant store: `rag-client`'s
`vectors.rs` scrolls the `dense` named vector out of the `r{hash}_vault_docs`
collection over loopback HTTP, bypassing rag's own service. That read is coupled to
rag's internal Qdrant shape - the collection name, the dense vector name, and its
dimension - and until now that shape was unversioned, so a rag model swap, a vector
rename, or a dimension change would break the engine's scroll silently (all-absence or
mixed-geometry vectors), with no signal to detect the drift. The `rag-service-management`
ADR gated this read on the QDRANT API version (D6) and explicitly recorded "a
`contract_version`/`schema_version` on `/health`" as the coordination ask that would
let the gate also cover rag's own storage shape. rag has now shipped that contract: a
bare `schema_version` on `/health` and a full `schema` descriptor on `/readiness`
(effective dense dimension, vector names, payload fields, models). This ADR decides how
the engine adopts it - gating the direct-Qdrant read on rag's storage-schema version,
dense vector name, and dense dimension before scrolling - closing the last unversioned
coupling the cross-project service-management audit found.

## Considerations

- The engine is **read-and-infer**: it adds no rag semantics. It reads rag's advertised
  descriptor and applies rag's published compatibility rules (the reference's recipe and
  the Python `assert_compatible`), verbatim - it does not invent its own shape policy.
- The read path already has a **version gate** (D6, the Qdrant major) and a single
  **honest-absence degrade** closure feeding the tiers block. The storage-schema gate is
  a sibling gate in the same sequence, not new machinery - it reuses the degrade closure
  and the "state the mismatch, never guess" discipline.
- The engine already pays a `/health` round-trip in its running-probe (for the Qdrant
  version); the bare `schema_version` rides there for free. The full descriptor
  (`dim`, dense `name`) is a second read on rag's service port via the existing
  `control::readiness` verb.
- The engine pins what it was **built and tested against** (a known schema version and an
  expected dense dimension), exactly as it pins the Qdrant major it understands. The
  contract fails CLOSED: an unknown-newer shape or a divergent dimension degrades rather
  than serving a shape the engine may misread.

## Constraints

- **Parent stability.** Depends on the shipped rag storage-schema contract (PR landed:
  `schema_version` on `/health`, the `schema` descriptor on `/readiness`), the engine's
  `rag-service-management` D6 gate and `probe_machine_state`/`HealthInfo`, the
  `control::readiness` verb, and the `degraded_embeddings`/`degraded_tiers` envelope - all
  stable on the engine `main`. No frontier risk: this is a gate addition over a working
  read path.
- **External cross-repo contract.** rag's descriptor shape is an external contract the
  engine version-tolerates: it reads the named fields and degrades on absence, never
  hard-parses rag internals. A rag-side ADDITIVE change (new payload field) must not
  trip the gate - only a version bump or a dim/name divergence does.
- **engine-read-and-infer / bounded HTTP / tiers-honest.** The `/readiness` read carries
  the existing per-verb wall-clock budget; the gate produces only a tiers degrade, never a
  5xx. Pure gate functions are unit-tested with the existing `FakeTransport`/JSON-fixture
  pattern; `cargo fmt` + `clippy -D warnings` gate.

## Implementation

Four decisions.

**D1 — A pure storage-schema gate in `rag-client`, beside the Qdrant gate.** Add
`storage_schema_supported(...)` to `vectors.rs` (or a sibling `schema.rs`): given rag's
advertised version, dense vector name, and effective dim - plus the engine's pinned
`KNOWN_STORAGE_SCHEMA_VERSION` and `EXPECTED_DENSE_DIM` - it returns compatible, or a
typed reason. The rules are rag's recipe verbatim: rag version GREATER than known →
incompatible (newer shape may be unreadable); dense vector name absent or not `dense` →
incompatible (the scroll would return all-absence); effective `dim` not equal to the
engine's expected → incompatible (wrong geometry is garbage, a hard refuse). A small
extractor pulls `version` / `vault.vectors.dense.name` / `vault.vectors.dense.dim` from
the `/readiness` descriptor `Value`, tolerant of absence (a missing field is a stated
incompatibility, not a panic).

**D2 — `HealthInfo` gains `schema_version`.** The `/health` parse in `client.rs` adds an
`Option<u64> schema_version`, so the bare version rides the running-probe the engine
already performs - the cheap pre-read gate that short-circuits a newer shape before the
`/readiness` round-trip.

**D3 — Two-stage gate wired in `query.rs`, after the Qdrant gate, before the scroll.**
First the cheap version gate off `/health`'s `schema_version` (newer → degrade with the
versions stated). If it passes, read the descriptor via `control::readiness`, extract the
dense name + dim, and apply the name and dim checks (mismatch → degrade with the values
stated). A `/readiness` read that fails (rag flaking) degrades, exactly like the existing
semantic-epoch read. Every failure path calls the existing `degraded_embeddings(reason)`
closure - no new error surface.

**D4 — Pinned constants are the engine's declared compatibility.** `KNOWN_STORAGE_SCHEMA_VERSION`
(1, today) and `EXPECTED_DENSE_DIM` (1024) are reviewed code constants, the engine's
analog of the pinned Qdrant major. Bumping them is a deliberate "the engine now
understands rag's new shape" change, reviewed alongside whatever scene/read change the new
shape required. They are NOT trusted live from rag - the engine declares what it supports.

## Rationale

The decisions follow from where the coupling lives and how the engine already degrades
(research F1-F7). The read is the engine's only direct dependency on rag's internal shape
(F2), and rag now advertises that shape (F3), so the honest move is to gate on the advertised
contract with rag's own rules (F4) rather than keep assuming. Placing the gate in
`rag-client` beside `qdrant_collection_api_supported` (D1) keeps the Qdrant coupling
behind its one seam and makes the gate pure and unit-testable. Reading the bare version off
the `/health` the probe already fetched (D2/D3, research F5) adds zero round-trips for the
common pass, and only pays `/readiness` when the cheap gate passes - the engine's existing
cheapest-pre-read-gate discipline. Pinned constants (D4) make the engine fail closed and
make "we now support rag schema vN" an explicit, reviewed event, exactly like the Qdrant
major. The whole change reuses the existing degrade closure (F6), so it adds a gate, not an
error path.

## Consequences

- **Gains.** The engine's last unversioned coupling to rag is closed: a rag storage-shape
  change can no longer silently break the embedding read - it degrades the semantic tier
  with the mismatch stated, and the fix is a reviewed constant bump plus whatever the new
  shape needs. The console/scene get a truthful "semantic unavailable: rag schema vN newer
  than supported" instead of an empty graph with no explanation.
- **Honest difficulties.** The descriptor is an external cross-repo contract; the engine
  must read named fields tolerantly and degrade on absence, never hard-parse. The dim gate
  pins 1024 - a deliberate model change on the rag side (a real dimension change) requires a
  coordinated engine constant bump, which is the POINT (it should not happen silently) but is
  a cross-repo coordination cost. The `/readiness` read is a second round-trip on the
  service port (mitigated by gating it behind the cheap `/health` version check).
- **Pathways opened.** Once the descriptor is read, the engine could surface rag's advertised
  dim/version to the frontend (so the scene asserts independently) and could key a future
  payload-aware feature on the descriptor's `payload_fields`. Both are out of scope here.
- **Pitfalls to avoid.** Tripping the gate on an additive rag field (only version/name/dim
  divergence may degrade); hard-parsing the descriptor instead of tolerant field reads;
  trusting rag's version as the engine's supported version (the engine declares its own);
  or reading `/readiness` on the per-request hot path unconditionally instead of behind the
  cheap version gate.

## Codification candidates

- **Rule slug:** `direct-qdrant-reads-gate-on-the-advertised-schema`.
  **Rule:** Any engine read that reaches into rag's Qdrant store directly must gate on
  rag's advertised storage-schema contract (the `schema_version` on `/health` and the
  `/readiness` descriptor's dense vector name and effective dimension) against the engine's
  pinned known-version and expected-dimension constants BEFORE reading, and degrade the
  semantic tier with the mismatch stated rather than scrolling a shape it may misread.

(Holds one full execution cycle before promotion, per the codify discipline. Complements
`engine-read-and-infer` and the D6 Qdrant capability gate.)
