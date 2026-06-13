---
tags:
  - '#plan'
  - '#dashboard-optimization'
date: '2026-06-13'
modified: '2026-06-14'
tier: L3
related:
  - '[[2026-06-13-dashboard-optimization-adr]]'
  - '[[2026-06-13-dashboard-optimization-research]]'
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
     Replace dashboard-optimization with a kebab-case feature tag, e.g. #foo-bar.
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

# `dashboard-optimization` plan

A standing campaign: feature completeness + performance optimization across TanStack, the GUI, and the backend, on an adverse-test foundation - reproduce, fix, verify, codify, in waves.

## Wave `W01` - Adverse-test infrastructure

Stand up the storm harness, bounded-growth assertion, and CI perf gate that reproduce and pin every later fix. Leads so each perf fix fails-then-passes an adverse test. Backs: ADR D3/D4 W01.

### Phase `W01.P01` - Adverse harnesses

The storm/bounded-growth test utilities and the CI perf gate.

- [x] `W01.P01.S01` - Add the fake-timer delta-storm harness and the bounded-growth assertion helper; `frontend/src/testing/adverse.ts`.
- [ ] `W01.P01.S02` - Add the CI perf-gate spec that reads the spike frame-time results and asserts the p95 budget; `frontend/e2e/perf.spec.ts`.

## Wave `W02` - Performance optimization

Apply the four resource policies (bounded accumulation, coalesced invalidation, settle-and-stop, reversible lifecycle) to the ranked hotspots; depends on W01's harness. Backs: ADR D2/D4 W02.

### Phase `W02.P02` - Stores-side performance

Bound the live accumulator and coalesce the invalidation storms.

- [x] `W02.P02.S03` - Bound the streamed-query accumulator to a summary so it cannot grow session-unbounded; `frontend/src/stores/server/queries.ts`.
- [x] `W02.P02.S04` - Add a shared trailing-edge debounce and coalesce the graph and status invalidation storms; `frontend/src/stores/server/graphSync.ts`.

### Phase `W02.P03` - Scene-side performance

Settle the layout loop and make scene mount bindings reversible.

- [ ] `W02.P03.S05` - Add convergence detection so the FA2 worker settles and stops, restarting on input; `frontend/src/scene/field/fa2.worker.ts`.
- [ ] `W02.P03.S06` - Make the scene mount bindings reversible so they do not leak across remounts; `frontend/src/scene/field/fieldAssembly.ts`.

## Wave `W03` - Feature completeness

Finish the built-but-unwired surfaces now engine-unblocked (live delta-apply, feature asof, scrub e2e) and consolidate the dispatch confirm-guard. Backs: ADR D4 W03.

### Phase `W03.P04` - Live data plane and seams

Wire the now-unblocked live delta-apply and consolidate the dispatch confirm-guard.

- [x] `W03.P04.S07` - Wire the live no-refetch delta-apply and feature-granularity asof keyframe; `frontend/src/stores/server/graphSync.ts`.
- [ ] `W03.P04.S08` - Consolidate the ops and palette arm-to-confirm onto the dispatch confirm-guard; `frontend/src/app/palette/CommandPalette.tsx`.

## Wave `W04` - Engine sweep and campaign verification

Engine-side performance sweep (sequenced last; heavy cargo builds) and the campaign verification audit. Backs: ADR D4 W04.

### Phase `W04.P05` - Verification

Engine perf sweep and the campaign verification audit.

- [x] `W04.P05.S09` - Run the engine-side performance sweep; `engine/crates/vaultspec-api/src`.
- [x] `W04.P05.S10` - Run the campaign verification gates and record the audit; `frontend/`.

## Description

This plan executes the `dashboard-optimization` ADR as a waved campaign. W01 stands up
the adverse-test infrastructure (storm harness, bounded-growth assertion, perf gate) that
reproduces every later fix; W02 applies the four resource policies to the ranked
performance hotspots; W03 finishes the now-engine-unblocked completeness surfaces and
consolidates the dispatch confirm-guard; W04 sweeps the engine and runs the campaign
verification. Each step follows the campaign cadence: reproduce (adverse test) -> fix ->
verify -> codify. The full backlog with evidence is in the `dashboard-optimization`
research; the budgets and policies are ADR D1-D3.

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

Waves are sequenced: W01 (harness) must land before W02 so each perf fix is reproduced
first; W02 before W03 because the unwired live delta-apply will stress the accumulators
and frame budget W02 hardens; W04 is last. Within W02 the two phases (stores-side P02,
scene-side P03) share no interdependency and may proceed in parallel. Within a phase,
each step pairs an adverse test (reproduce) with its fix.

## Verification

The campaign advances wave by wave; each wave's exit gate, and the plan's completion,
require all of:

- `cd frontend && npm run typecheck && npm run lint && npm run test` green (new adverse
  tests included and kept as regressions).
- `cd frontend && npm run build` green.
- The W01 perf gate (`e2e/perf.spec.ts`) holds the frame p95 budget; the bounded-growth
  and storm-coalescing adverse tests pass.
- `vaultspec-core vault check all` green.
- The concurrent conformance-hardening adversarial suite stays green.
- The `vaultspec-code-review` audit signs off each wave with no unresolved HIGH findings.

For tier-specific verification cadence, see the convention ADR
authorizing this plan via the `related:` frontmatter. -->
