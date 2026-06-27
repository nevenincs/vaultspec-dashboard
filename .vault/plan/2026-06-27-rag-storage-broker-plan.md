---
tags:
  - '#plan'
  - '#rag-storage-broker'
date: '2026-06-27'
modified: '2026-06-27'
tier: L2
related:
  - '[[2026-06-27-rag-storage-broker-adr]]'
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
     Replace rag-storage-broker with a kebab-case feature tag, e.g. #foo-bar.
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

# `rag-storage-broker` plan

Broker rag's destructive storage verbs (delete/prune/migrate) through the bounded CLI runner with validated arguments, dry-run-default, and exit-1 envelope forwarding.

### Phase `P01` - the destructive-storage broker primitives

Add the storage CLI whitelist, the validated-argument assembly with the prefix/backend/apply guards, and the storage-aware stdout-inspecting runner (ADR D1, D2, D4).

- [x] `P01.S01` - Add the RAG_STORAGE_CLI_WHITELIST mapping storage-delete, storage-prune, and storage-migrate to their fixed rag base args; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `P01.S02` - Add a validate_namespace_prefix guard rejecting any value that is not rag's canonical r-hash prefix; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `P01.S03` - Implement storage_args_for assembling the validated argv per verb (prefix for delete, active-cell root and to-backend enum for migrate, the dry-run or yes flag from apply); `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `P01.S04` - Implement a storage-aware bounded runner that forwards the rag ok-and-command envelope verbatim on a non-zero preview exit and 502s only a genuine fault; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `P01.S05` - Unit-test the prefix guard, the argv assembly per verb, and the runner envelope-forwarding-on-exit-1 versus 502-on-fault; `engine/crates/vaultspec-api/src/routes/ops.rs`.

### Phase `P02` - the brokered route and dry-run gating

Wire the destructive verbs into a validated route with dry-run-default/explicit-apply and machine-scoped framing, with tests (ADR D3, D5).

- [x] `P02.S06` - Add the ops_rag_storage route validating the body, gating apply to --yes versus the default --dry-run, and running the storage-aware runner; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `P02.S07` - Register the storage route in the router and the brokered ops namespace; `engine/crates/vaultspec-api/src/lib.rs`.
- [x] `P02.S08` - Add route-level tests asserting an unknown verb 403s, a malformed prefix 400s, the default request previews, and an apply request passes yes; `engine/crates/vaultspec-api/src/routes/ops.rs`.

## Description

Add the destructive storage verbs to the engine's brokered surface through the bounded
CLI subprocess runner, per the accepted ADR. Phase P01 builds the primitives in
`routes/ops.rs`: a `RAG_STORAGE_CLI_WHITELIST` for `storage-delete`/`storage-prune`/
`storage-migrate`, a `validate_namespace_prefix` guard (rag's canonical `^r[0-9a-f]{12}_$`),
a `storage_args_for` argv assembler (the validated prefix for delete; the active-cell root
and `server|local` enum for migrate; `--dry-run` by default or `--yes` on apply), and a
storage-aware bounded runner that forwards rag's `{ok, command, data}` envelope verbatim on
a non-zero preview exit and 502s only a genuine fault - all unit-tested. Phase P02 wires the
validated route with dry-run-default / explicit-apply gating and machine-scoped framing,
registers it, and adds the route tests (unknown verb 403, malformed prefix 400, default
preview, apply passes `--yes`). Grounded in the `rag-storage-broker` research and ADR;
completes the storage-management surface (survey -> preview -> reclaim) the
`rag-service-management` survey read opened, and closes the original cross-project audit's
"see but cannot act" gap.

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

P01 must land before P02: the route consumes the whitelist, the validator, the argv
assembler, and the runner P01 builds. Within P01, the whitelist (S01) and prefix guard
(S02) are independent; `storage_args_for` (S03) consumes both; the runner (S04) is
independent of them; S05 tests all four. Within P02, the route (S06) and its registration
(S07) are one cohesive change, with S08 (route tests) closing the phase. The test steps
(S05, S08) gate their phase's completion.

## Verification

The plan is complete when every Step is closed and these criteria hold:

- `validate_namespace_prefix` accepts rag's canonical `r{12-hex}_` and rejects anything
  else (a non-matching string, a `-`-prefixed option, an empty value), 400-ing before any
  subprocess (unit tests).
- `storage_args_for` assembles the exact argv per verb: `delete` carries the validated
  prefix; `migrate` carries the active-cell root and the `server|local` enum; every verb
  carries `--dry-run` by default and `--yes` only when apply is set; `--json` is always
  present and `--allow-unknown` is never assembled (unit tests).
- The storage-aware runner forwards rag's `{ok, command, ...}` envelope verbatim on a
  non-zero (preview) exit and returns a 502 only for an unparseable/empty stdout with a
  non-zero exit, a spawn failure, or a timeout (unit tests with injected short bounds).
- The route 403s an unknown verb and 400s a malformed prefix before any subprocess, passes
  `--dry-run` by default, and passes `--yes` on an explicit apply (route tests).
- delete/prune are machine-scoped (no `project_root` derivation); migrate sources its root
  from the active cell (verified by the argv assembly).
- `cargo fmt --check`, `cargo clippy --workspace --all-targets -D warnings`, and
  `cargo test` are green on the engine workspace; `vaultspec-core vault check all` stays
  clean.
