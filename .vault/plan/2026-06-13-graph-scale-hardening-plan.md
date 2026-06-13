---
tags:
  - '#plan'
  - '#graph-scale-hardening'
date: '2026-06-13'
modified: '2026-06-13'
tier: L2
related:
  - '[[2026-06-13-graph-scale-hardening-adr]]'
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
     Replace graph-scale-hardening with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.
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
     guaranteed only when the CLI performs the mutation. See the
     CLI ADR (2026-05-06-plan-hardening-adr) for the full
     subcommand surface. -->

# `graph-scale-hardening` plan

### Phase `P01` - Linear-ingest resolution (D1)

Make cold index near-linear by resolving mentions against a once-built inventory and inverted index instead of a per-document tree walk and codebase re-read.


<!-- One-line headline summary plan. -->

- [x] `P01.S01` - Thread a once-built worktree inventory into resolution; `engine/crates/ingest-struct/src/resolve.rs`.
- [x] `P01.S02` - Build inverted indices (basename, qualified-symbol, step-id) once and resolve each mention by lookup; `engine/crates/ingest-struct/src/resolve.rs`.
- [x] `P01.S03` - Re-run scale_bench and record the cold-index before and after, keeping resolver tests green; `engine/tests/tests/scale_bench.rs`.

### Phase `P02` - Memoized projections + serialization (D3)

Compute the derived projections and serialized slice once per immutable graph generation so concurrent reads reuse one computation.

- [ ] `P02.S04` - Memoize the derived projections and serialized slice on the graph generation, invalidated at commit; `engine/crates/engine-query/src/graph.rs`.
- [ ] `P02.S05` - Re-run the scale_bench concurrent pass and record before/after; `engine/tests/tests/scale_bench.rs`.

### Phase `P03` - Bounded-query contract (D2)

Make every graph read bounded: LOD default, finished cursor pagination, a viewport filter, and a hard node ceiling, amending the wire contract.

- [ ] `P03.S06` - Default to LOD, finish cursor pagination, and enforce a hard node ceiling on document granularity; `engine/crates/vaultspec-api/src/routes/query.rs`.
- [ ] `P03.S07` - Add a viewport/region filter parameter to the document query; `engine/crates/engine-query/src/filter.rs`.
- [ ] `P03.S08` - Amend the contract reference and add conformance assertions for the bounded-query semantics; `engine/tests/tests/conformance.rs`.

### Phase `P04` - Frontend LOD default + viewport descent (D4)

Default the GUI graph query to the constellation LOD and descend to bounded document/viewport slices on zoom-in.

- [ ] `P04.S09` - Default the GUI graph query to the constellation LOD and descend to bounded slices on zoom-in; `frontend/src/stores/server/queries.ts`.
- [ ] `P04.S10` - Re-run the frontend gates green (typecheck, lint, test, build); `frontend/src`.

### Phase `P05` - Codify the scale disciplines (D5)

Promote the GPU-boundary and bounded-query constraints into project rules so future agents inherit them.

- [ ] `P05.S11` - Codify the GPU-boundary and bounded-query rules as project rules; `.vaultspec/rules/rules`.

## Description

Binding implementation of the accepted `graph-scale-hardening` ADR, grounded in
the `scale_bench` evidence from the research. The phases are ordered by value and
risk: P01 attacks the largest blocker (the super-linear cold index) with a
behavior-preserving resolution rewrite; P02 removes per-request projection churn
by memoizing on the immutable graph generation; P03 makes graph reads bounded
(the contract amendment); P04 lands the matching frontend default; P05 codifies
the disciplines. P01 and P02 are pure performance work proven by tests staying
green plus a `scale_bench` before/after; P03 changes the wire contract and is
reviewed by both engine and GUI owners before P04 consumes it.

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

P01 and P02 are independent (ingest resolution vs. query-core memoization) and
may proceed in parallel; both are behavior-preserving and self-verify via
`scale_bench` before/after. P03 (the contract amendment) must land and pass
review before P04 (the frontend consumer) begins — the review-revision
precedence applies, since P04 builds on P03's bounded semantics. P05 (codify)
runs last, after the disciplines it records have held in execution.

## Verification

- P01: cold-index time grows ~linearly with corpus size on `scale_bench`
  (the ~58×-for-8× super-linearity is gone); the `ingest-struct` resolver tests
  stay green (identical resolution states), proving the change is
  behavior-preserving.
- P02: the `scale_bench` concurrent pass shows reduced per-request time and
  allocation under load; `engine-query` tests stay green.
- P03: `/graph/query` never returns an unbounded document slice — the
  constellation LOD is the default, document granularity is cursor-paginated
  under a hard node ceiling, and a viewport filter bounds descent; conformance
  asserts it and the contract reference is amended.
- P04: the frontend defaults to the constellation LOD and descends to bounded
  slices; the frontend gates (typecheck, lint, test, build) are green.
- P05: the GPU-boundary and bounded-query rules exist under
  `.vaultspec/rules/rules/` and `vaultspec-core spec rules list` enumerates them.
- Engine `cargo test --workspace`, `clippy --all-targets -D warnings`, and
  `fmt --check` green; `vaultspec-core vault check all` green; every Step closed
  (`- [x]`); per-phase review before closure.
