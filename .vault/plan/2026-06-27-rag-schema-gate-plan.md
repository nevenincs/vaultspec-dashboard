---
tags:
  - '#plan'
  - '#rag-schema-gate'
date: '2026-06-27'
modified: '2026-06-27'
tier: L2
related:
  - '[[2026-06-27-rag-schema-gate-adr]]'
---

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the
       related: field above.
     - The related: field carries the AUTHORISING documents
       (ADR, research, reference, prior plan) for every Step in
       this plan. Steps inherit this chain; per-row reference
       footers do not exist.
     - NEVER use [[wiki-links]] or markdown links in the
       document body. -->

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #plan) and one feature tag.
     Replace rag-schema-gate with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     tier is mandatory for new plans. Allowed: L1, L2, L3, L4.
     L1 = Steps only. L2 = Phases above Steps. L3 = Waves above
     Phases above Steps. L4 = Epic above Waves above Phases above
     Steps; PM association required. Pre-existing plans without this
     field default to L2.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'. The related field
     carries the AUTHORIZING documents (ADR, research, reference, prior
     plan) for every Step in this plan; Steps inherit this chain;
     per-row reference footers do not exist.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- HIERARCHY AND TIERS:
     Epic > Wave > Phase > Step. Step is the canonical leaf-row
     noun. Execution Record artifact: <Step Record>.
     Tier is declared in frontmatter as tier: L1/L2/L3/L4
     (mandatory for new plans; pre-existing plans without the
     field default to L2 and the writer adds the field on first
     edit). The tier selects containers:
       L1 = Steps only.
       L2 = Phases above Steps.
       L3 = Waves above Phases above Steps.
       L4 = Epic above Waves above Phases above Steps; MUST declare
            a project-management association in the Epic intent
            block prose.
     Selection is by complexity criteria, not container counting.
     Writer never invents containers to qualify a tier. -->

<!-- IDENTIFIERS AND ROW CONTRACT:
     S##, P##, W## are flat, per-document, append-only, immutable.
     Promotion adds containers without renumbering. Gaps are not
     reused.
     Display paths are computed from current grouping:
       Step path:    L1 S##   L2 P##.S##   L3/L4 W##.P##.S##
       Phase heading:        L2 P##       L3/L4 W##.P##
       Wave heading:                      L3/L4 W##
     Row format:
       - [ ] `<display-path>` - imperative-verb action; `path/to/file`.
     Two-state checkboxes only ([ ] open, [x] closed). No per-row
     reference footers; wiki-links and markdown links are forbidden
     in plan body. Authorizing documents go in the plan's `related:`
     frontmatter once.
     ASCII spaced hyphens everywhere; em-dash (U+2014) and en-dash
     (U+2013) are forbidden. Step rows within a Phase are
     contiguous. -->

<!-- NO COMPRESSION:
     N self-similar actions = N rows. Never collapse into "for each
     X, do Y" / "across all callers, do Z" / "in every module,
     replace W". The rule applies at every tier including L1. -->

<!-- VAULTSPEC-CORE VAULT PLAN CLI:
     The `vaultspec-core vault plan` CLI is the canonical surface for
     structural manipulation of this plan document. Writers and
     executors MUST use `vaultspec-core vault plan step add/insert/move/
     remove/check/uncheck/toggle/edit`,
     `vaultspec-core vault plan phase add/move/remove/edit`,
     `vaultspec-core vault plan wave add/move/remove/edit`,
     `vaultspec-core vault plan epic intent`, and
     `vaultspec-core vault plan tier promote/demote` for every
     identifier-affecting change rather than hand-editing the row
     grammar. Hand edits are tolerated by the parser but flagged by
     `vaultspec-core vault plan check`; canonical-identifier preservation is
     guaranteed only when the CLI performs the mutation. Run
     `vaultspec-core vault plan --help` for the full subcommand
     surface. -->

# `rag-schema-gate` plan

Gate the engine's direct-Qdrant embedding read on rag's advertised storage-schema contract (version, dense vector name, dimension) and degrade honestly on a mismatch.

### Phase `P01` - the storage-schema gate in rag-client

Add the HealthInfo schema_version field, the pinned engine constants, the descriptor extractor, and the pure storage_schema_supported gate (ADR D1, D2, D4).

- [x] `P01.S01` - Add the schema_version Option u64 field to HealthInfo and parse it from the /health body; `engine/crates/rag-client/src/client.rs`.
- [x] `P01.S02` - Pin KNOWN_STORAGE_SCHEMA_VERSION and EXPECTED_DENSE_DIM as the engine's declared-compatibility constants; `engine/crates/rag-client/src/vectors.rs`.
- [x] `P01.S03` - Implement a tolerant extractor pulling version, dense vector name, and effective dim from the /readiness descriptor value; `engine/crates/rag-client/src/vectors.rs`.
- [x] `P01.S04` - Implement the pure storage_schema_supported gate applying the newer-version, dense-name, and dimension rules with a typed reason; `engine/crates/rag-client/src/vectors.rs`.
- [x] `P01.S05` - Unit-test the extractor and the gate across compatible, newer-version, dim-mismatch, missing-dense-name, and malformed-descriptor cases; `engine/crates/rag-client/src/vectors.rs`.

### Phase `P02` - wire the two-stage gate into the embedding read

Apply the cheap /health version gate then the /readiness dim+name gate in query.rs before the scroll, degrading through the existing closure (ADR D3).

- [x] `P02.S06` - Apply the cheap /health schema_version gate after the Qdrant capability gate, degrading on a newer version before the /readiness round-trip; `engine/crates/vaultspec-api/src/routes/query.rs`.
- [x] `P02.S07` - Read the /readiness descriptor and apply the dense-name and dimension gate before the scroll, degrading through the existing closure; `engine/crates/vaultspec-api/src/routes/query.rs`.
- [x] `P02.S08` - Add a route-level test asserting a newer schema_version and a dimension mismatch each degrade the embedding tier with the reason stated; `engine/crates/vaultspec-api/src/routes/query.rs`.

## Description

Adopt rag's shipped storage-schema contract in the engine's direct-Qdrant embedding
read, per the accepted ADR. Phase P01 builds the gate inside `rag-client` (the seam
that owns the Qdrant coupling): `HealthInfo` gains a `schema_version` field parsed from
`/health`, the engine pins `KNOWN_STORAGE_SCHEMA_VERSION` and `EXPECTED_DENSE_DIM` as
its declared compatibility, a tolerant extractor pulls the version/dense-name/dim from
the `/readiness` descriptor, and a pure `storage_schema_supported` gate applies rag's
recipe (newer-version → degrade, dense-name-must-exist, dim-mismatch → hard refuse), all
unit-tested. Phase P02 wires the two-stage gate into `query.rs`'s embedding handler,
after the existing Qdrant capability gate and before the scroll: the cheap `/health`
version check first, then the `/readiness` dim+name check, each degrading through the
existing `degraded_embeddings` closure with the mismatch stated. Grounded in the
`rag-schema-gate` research and ADR; closes the last unversioned coupling the
cross-project service-management audit found, completing the D6 capability gate.

## Steps

<!-- The plan's tier (declared in frontmatter as `tier: L1`, `L2`, `L3`, or
`L4`) determines the structure under this section:

- `L1`: a flat list of Step rows (no Phase, Wave, or Epic).
- `L2`: one or more `### Phase` blocks each containing Step rows.
- `L3`: one or more `## Wave` blocks each containing Phase blocks.
- `L4`: a `## Epic intent` block, followed by Wave blocks. -->

<!-- Replace this scaffold with the tier-appropriate structure for your plan.
Format examples for each block type are embedded below as commented
templates. -->

<!-- IMPORTANT: This document must be updated between execution runs to
     track progress. -->

<!-- PHASE BLOCK FORMAT (L2, L3, L4):
     ### Phase `P02` - rewrite the writer-agent contract

     One sentence stating what this Phase delivers.

     - [ ] `P02.S01` - imperative-verb action; `path/to/file`.
     - [ ] `P02.S02` - imperative-verb action; `path/to/file`.

     At L3/L4 the Phase heading uses the ancestor-aware path
     (### Phase `W01.P02` - ...). The intent sentence is mandatory. -->

<!-- WAVE BLOCK FORMAT (L3, L4):
     ## Wave `W01` - language-only convention rollout

     One paragraph stating what this Wave delivers, which downstream
     Wave depends on it, and which authorizing documents back it.

     ### Phase `W01.P01` - ...
     ### Phase `W01.P02` - ...

     The Wave intent paragraph is mandatory. -->

<!-- EPIC INTENT BLOCK FORMAT (L4 only):
     ## Epic intent

     One paragraph stating the strategic goal, the external project-
     management association (milestone name, project board identifier,
     roadmap entry), the timeline horizon, and the teams or agents
     involved.

     ## Wave `W01` - ...
     ## Wave `W02` - ...

     The ## Epic intent block is mandatory at L4 and absent at L1, L2,
     L3. The plan title (the level-one # heading at the top of the
     document) is the Epic title; no separate Epic heading is emitted. -->

## Parallelization

P01 must land before P02: the wiring consumes the gate, the constants, and the
`HealthInfo.schema_version` field P01 creates. Within P01, S01 (the `HealthInfo` field)
and S02 (the constants) are independent; S03 (extractor) and S04 (gate) build on the
constants; S05 (tests) follows S03/S04. Within P02, S06 (version gate) and S07 (dim+name
gate) are one cohesive edit to the handler and should land together, with S08 (route
test) closing the phase. The test steps (S05, S08) gate their phase's completion.

## Verification

The plan is complete when every Step is closed and these criteria hold:

- `storage_schema_supported` returns compatible for an equal/older rag version with the
  expected dense name and dim, and an incompatible verdict with a stated reason for a
  newer version, a missing/wrong dense name, and a dimension mismatch (unit tests).
- The descriptor extractor reads `version` / dense `name` / dense `dim` from a real
  `/readiness` descriptor JSON and treats every absent field as a stated incompatibility,
  never a panic (unit tests).
- `HealthInfo` parses `schema_version` from a `/health` body and tolerates its absence
  (an older rag) as `None` (unit test).
- The embedding handler degrades the semantic tier (empty embeddings + degraded tiers
  block, never a 5xx) with the mismatch stated when rag advertises a newer
  `schema_version` or a divergent dense dimension, and serves vectors unchanged when the
  contract is compatible (route test).
- The cheap `/health` version gate short-circuits before the `/readiness` round-trip on a
  newer version (no descriptor read on the fail-fast path).
- `cargo fmt --check`, `cargo clippy --workspace --all-targets -D warnings`, and
  `cargo test` are green on the engine workspace; `vaultspec-core vault check all` stays
  clean.
