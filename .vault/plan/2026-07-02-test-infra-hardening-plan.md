---
tags:
  - '#plan'
  - '#test-infra-hardening'
date: '2026-07-02'
modified: '2026-07-02'
tier: L2
related:
  - '[[2026-07-02-test-infra-hardening-audit]]'
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
     Replace test-infra-hardening with a kebab-case feature tag, e.g. #foo-bar.
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

# `test-infra-hardening` plan

### Phase `P01` - Timeout policy

Build a shared engine-round-trip timeout policy and a wrapped waitFor, then sweep the frontend test suite's waitFor callsites onto it.


<!-- One-line headline summary plan. -->

- [x] `P01.S01` - TIH-002: build frontend/src/testing/timing.ts (engine-round-trip timeout policy as data plus a wrapped waitFor) and sweep the roughly 25 test files and 116 waitFor callsites onto it, the GS-007 VaultBrowser ENGINE_WAIT fix is the first consumer; `frontend/src/testing/timing.ts`.

### Phase `P02` - Engine quiescence barrier

Add an engine-quiescence barrier to the live-engine global setup and render-suite beforeAlls so waits do not race write-triggered rebuild storms.

- [x] `P02.S02` - TIH-003 plus TIH-006: add awaitEngineQuiescent() (tiers-available plus generation-stable over /status) to the live-engine global setup and render-suite beforeAlls, so waits do not race write-triggered rebuild storms, closes the file-1 declared-fold-in-flight gap; `frontend/src/testing/liveEngine.globalSetup.ts`.
- [x] `P02.S06` - TIH-007: fix the VaultBrowser cross-test server-side selection leak (a leaked selected_ids let the GS-003 reveal reaction re-render the tree and detach a captured element) via beforeEach dashboard-state reset plus follow-off, close the happy-dom drain blind spot (raw patch invisible to the isFetching drain) that produced the AbortError class; `frontend/src/app/left/VaultBrowser.render.test.tsx + frontend/src/testing/liveSetup.ts`.

### Phase `P03` - Write hygiene / fixture isolation

Make write-touching suites restore state after themselves so later suites are not coupled to run order.

- [x] `P03.S03` - TIH-004: write suites restore state, sacrificial-document plus preimage restore in afterAll, settings and session snapshot-restore, per-suite scratch scopes, so later suites are not run-order-coupled; `frontend/src/testing/`.

### Phase `P04` - Engine binary selection

Guard the test harness's engine binary selection against racing an in-flight cargo build.

- [x] `P04.S04` - TIH-005: add a VAULTSPEC_TEST_ENGINE_BIN override plus a chosen-binary banner so the mtime-picked engine binary cannot race an in-flight cargo build; `frontend/src/testing/liveEngine.globalSetup.ts`.

### Phase `P05` - Measurement

Instrument per-file suite timing and capture baseline plus post-fix measurements so the campaign closes with measured evidence.

- [ ] `P05.S05` - TIH-instrumentation: a per-file wall-clock vitest reporter, capture a baseline run and a post-fix run so the campaign closes with measured evidence; `frontend/vitest.config.ts`.

## Description

Remediation of the test-infra-hardening audit (TIH-002/003 HIGH, TIH-004 MED, TIH-005/006 LOW; TIH-001 sound). Bounded, zero-product-risk test-infra fixes; land P01/P02 before the external ASA team's W09 wave.

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

<!-- State which Steps, Phases, or Waves can be executed in parallel and
which carry hard ordering. At `L1` and `L2`, parallelism is decided
per-Step or per-Phase. At `L3` and `L4`, Waves are sequenced by
default (one Wave must land before the next can begin); Phases
within a single Wave may be parallelized when they share no hard
interdependency. -->

## Verification

<!-- State the mission success criteria for this plan. Each criterion
should be a verifiable check (test passes, surface conforms,
reviewer signs off) rather than a free-form assertion.

The plan is complete when every Step in the plan is closed
(`- [x]`). At `L4`, the Epic-completion check additionally requires
the declared project-management association to report the Epic
complete.

For tier-specific verification cadence, see the authorizing
documents linked in the `related:` frontmatter. -->
