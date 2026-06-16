---
tags:
  - '#plan'
  - '#performance-sweep'
date: '2026-06-16'
tier: L2
related:
  - '[[2026-06-16-performance-sweep-adr]]'
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
     Replace performance-sweep with a kebab-case feature tag, e.g. #foo-bar.
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

# `performance-sweep` plan

### Phase `P01` - Engine speed + footprint

Memoize per-request graph projections and shrink the on-disk cache so concurrent document queries and cache footprint stop scaling per-request.


<!-- One-line headline summary plan. -->

- [x] `P01.S01` - Memoize the enriched document-slice projection per graph generation (A1); `engine/crates/vaultspec-api/src/app.rs`.
- [x] `P01.S02` - Gzip-compress the large declared-graph cache payloads at rest (A3); `engine/crates/engine-store/src/lib.rs`.

### Phase `P02` - Frontend bundle + render + leaks

Cut cold-load TTI, stop always-on GPU draw, bound fan-out, and drop dead deps so the GUI is light and idle-cheap.

- [x] `P02.S03` - Vendor manualChunks + lazy scene unit so chrome paints before Pixi loads (F#2); `frontend/vite.config.ts`.
- [x] `P02.S04` - Reversible scene unmount releasing GPU resources on Stage teardown (F#1); `frontend/src/app/stage/Stage.tsx`.
- [x] `P02.S05` - Idle-throttle the Pixi ticker so a static field schedules no per-frame draw (F#4); `frontend/src/scene/field/pixiField.ts`.
- [x] `P02.S06` - Skip the full layer rebuild on an unchanged set-data (F#5); `frontend/src/scene/field/fieldAssembly.ts`.
- [x] `P02.S07` - Cap the ego-network fan-out to bound concurrent neighbors (F#6); `frontend/src/stores/server/queries.ts`.
- [x] `P02.S08` - Remove the dead sigma/@pixi/react dependencies (F#3); `frontend/package.json`.

## Description

Binding catalogue of the accepted `performance-sweep` ADR's speed/footprint and
frontend avenues, grounded in the `performance-sweep` research's measured
baselines (`scale_bench`, `dist/` bundle, frame profile). Each step is a landed,
measured optimization commit; this plan is the formal closure of the campaign
whose work landed ahead of the pipeline artifacts. Ownership split with
`resource-hardening`: the crash-shaped engine items (gix bound, subprocess
timeout, bounded channel, sqlite vacuum/retention, task hygiene) belong to that
campaign and are NOT re-planned here.

Two research avenues are deliberately DEFERRED, not dropped: A4 (per-fold
`LinkageGraph` deep-clone) is correctness-load-bearing for D8.2 convergence and
only worth attacking under a commit storm; A5 (`meta_edges` returning an owned
clone) is LOW - the heavy aggregation is already memoized via the `LinkageGraph`
`OnceLock`, so sharing the `Arc` is a marginal, signature-rippling change. Both
are recorded in the ADR consequences.

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

P01 (engine) and P02 (frontend) are independent layers and landed in parallel.
Within each phase the steps are independent optimizations touching different
files (A1 app.rs vs A3 engine-store; the F# steps span vite/scene/stores). Each
self-verifies via its own gate (`scale_bench` / `dist/` size / the test suite).
All work stayed off the `resource-hardening` files via the ownership split.

## Verification

Complete when every Step is closed (`- [x]`) and all of:

- Each avenue landed as a measured commit (A1 `3f21826`, A3 `9d9e3a7`,
  F#2 `52b5558`, F#1 `6b5bd66`, F#4 `c32fd2a`, F#5 `e8402d6`, F#6 `2e1c8c4`,
  F#3 `<this campaign>`).
- Engine `cargo fmt --check`, `clippy --all-targets -D warnings`, and
  `test --workspace` green.
- Frontend `just dev lint frontend` + `npm run test` green.
- `vaultspec-core vault check all` green and `vault plan check` canonical.
- A `vaultspec-code-review` audit signs off the landed optimization work with no
  unresolved HIGH findings.
- The two deferred avenues (A4, A5) are recorded in the ADR, not silently
  dropped.
