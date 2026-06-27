---
tags:
  - '#plan'
  - '#rag-affordance-adoption'
date: '2026-06-27'
modified: '2026-06-27'
tier: L2
related:
  - '[[2026-06-27-rag-affordance-adoption-adr]]'
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
     Replace rag-affordance-adoption with a kebab-case feature tag, e.g. #foo-bar.
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

# `rag-affordance-adoption` plan

Adopt rag's machine-global discovery pointer (a new discovery candidate) and its idempotent JSON start (version-tolerant, with rag's authoritative failure reason).

### Phase `P01` - adopt the machine-global discovery pointer

Add the storage-parent pointer as the first discovery candidate, additive and tolerant (ADR D1).

- [x] `P01.S01` - Prepend the storage-parent machine-global pointer to service_json_candidates and update the precedence comment; `engine/crates/rag-client/src/client.rs`.
- [x] `P01.S02` - Unit-test that the machine-global pointer is the first candidate and an absent pointer is skipped; `engine/crates/rag-client/src/client.rs`.

### Phase `P02` - version-tolerant JSON start with authoritative failure reason

Append --json to the start, fall back when an older rag rejects it, and surface rag's stated failure reason (ADR D2, D3).

- [x] `P02.S03` - Append --json in rag_start_args; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `P02.S04` - Detect an older rag rejecting --json on the spawn path and retry the start without it; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `P02.S05` - Parse rag's structured failure envelope on a genuine non-zero exit and surface the stated reason, degrading to the re-probe otherwise; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `P02.S06` - Unit-test the unknown-option detection and the structured-reason extraction over JSON fixtures; `engine/crates/vaultspec-api/src/routes/ops.rs`.

## Description

Adopt the two broker-facing affordances rag shipped, per the accepted ADR. Phase P01 adds
rag's STATUS_DIR-independent machine-global pointer
(`~/.vaultspec-rag/qdrant-server/service.json`) as the FIRST candidate in
`service_json_candidates` (`rag-client/client.rs`), with the precedence comment updated to
record the previously-deferred pointer is now adopted; it is purely additive (a missing
candidate is skipped). Phase P02 adopts rag's idempotent `server start --json` in
`vaultspec-api/routes/ops.rs`: append `--json` in `rag_start_args`, and on the spawn path
make it VERSION-TOLERANT - if an older rag rejects the unknown `--json` option the start
retries without it - then on a genuine non-zero exit parse rag's `{ok:false, error, data}`
envelope to surface the stated failure reason (`machine_owned` holder pid, `port_in_use`,
`qdrant_missing`), degrading to the existing bounded re-probe inference otherwise. Both land
in one PR safe to merge against any rag version (no release ordering). Grounded in the
`rag-affordance-adoption` research and ADR; consumes the rag `rag-broker-affordances` change.

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

P01 and P02 are independent (different crates: `rag-client` vs `vaultspec-api`) and can be
done in either order; they are executed P01 then P02 for a clean review. Within P02, S03
(append `--json`) precedes S04 (the fallback) and S05 (the reason extraction), with S06
(tests) last. The test steps (S02, S06) gate their phase's completion.

## Verification

The plan is complete when every Step is closed and these criteria hold:

- `service_json_candidates` returns the storage-parent machine-global pointer FIRST, ahead
  of the STATUS_DIR file and the per-scope fallback; an absent pointer is skipped by
  `discover_at` (unit tests).
- `rag_start_args` includes `--json`; the spawn path retries the start WITHOUT `--json` when
  an older rag rejects the unknown option (detected from the captured output), so the
  adoption never breaks against a rag that predates the flag (unit test of the detection).
- On a genuine non-zero start exit, rag's `{ok:false, error, data}` envelope is parsed and
  the stated reason (`machine_owned`/`port_in_use`/`qdrant_missing`) is surfaced; a
  non-envelope output degrades to the existing re-probe inference (unit tests over JSON
  fixtures).
- The engine's probe-first attach (`already_running` without calling start) is unchanged.
- `cargo fmt --check`, `cargo clippy --workspace --all-targets -D warnings`, and
  `cargo test` are green; `vaultspec-core vault check all` stays clean.
