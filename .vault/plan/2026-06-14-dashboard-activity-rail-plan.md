---
tags:
  - '#plan'
  - '#dashboard-activity-rail'
date: '2026-06-14'
modified: '2026-06-14'
tier: L2
related:
  - '[[2026-06-14-dashboard-activity-rail-adr]]'
  - '[[2026-06-14-dashboard-activity-rail-research]]'
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
     Replace dashboard-activity-rail with a kebab-case feature tag, e.g. #foo-bar.
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

# `dashboard-activity-rail` plan

Refactor the right rail from three tabs to the four-tab review-rail IA and add the `work` tab as a designed frame; the pipeline content is a separate plan.

### Phase `P01` - rail tab-strip refactor to four tabs

Refactor the right-rail tab strip from three tabs to the four-tab review-rail information architecture (now / work / changes / search), inserting the work tab in second position while preserving the existing tablist affordance and the unchanged membership of now, changes, and search.


<!-- One-line headline summary plan. -->

- [x] `P01.S01` - Add the work tab entry to the RAIL_TABS array in second position so the order reads now, work, changes, search; `frontend/src/app/AppShell.tsx`.
- [x] `P01.S02` - Extend the ActivityRail tab state union type to include the work tab id alongside activity, changes, and search; `frontend/src/app/AppShell.tsx`.
- [x] `P01.S03` - Add the work tab branch to the tab-content dispatch in ActivityRail rendering the WorkTab frame component; `frontend/src/app/AppShell.tsx`.
- [x] `P01.S04` - Verify the now tab keeps NowStrip, OpsPanel, and Inspector, the changes tab keeps ChangesOverview, and the search tab keeps SearchTab unchanged in membership; `frontend/src/app/AppShell.tsx`.

### Phase `P02` - work tab frame with designed degraded and empty state

Add the WorkTab frame component that renders the work pillar's own designed degraded and empty state, reading availability through a stores selector and never fetching the engine or reading the raw tiers block; the real pipeline content is delivered by the separate dashboard-pipeline-status plan and is out of scope here.

- [x] `P02.S05` - Create the WorkTab frame component as a new app-chrome surface in the right rail directory; `frontend/src/app/right/WorkTab.tsx`.
- [x] `P02.S06` - Read work-pillar availability in WorkTab through a stores selector hook only, never calling fetch and never reading the raw tiers block, per dashboard-layer-ownership; `frontend/src/app/right/WorkTab.tsx`.
- [x] `P02.S07` - Render a designed degraded state in WorkTab gated on the stores tiers truth, never inferred from a bare transport error, per degradation-is-read-from-tiers-not-guessed-from-errors; `frontend/src/app/right/WorkTab.tsx`.
- [x] `P02.S08` - Render a designed empty state in WorkTab for the available-but-no-work case stating no in-flight pipeline work in the current scope; `frontend/src/app/right/WorkTab.tsx`.
- [x] `P02.S09` - Style WorkTab using only inherited design-language tokens and the two sanctioned icon families with no new token, icon, or motion grammar; `frontend/src/app/right/WorkTab.tsx`.
- [x] `P02.S10` - Make the WorkTab degraded and empty states grayscale-safe so meaning is carried by shape and text first, not color alone; `frontend/src/app/right/WorkTab.tsx`.

### Phase `P03` - wire the work tab into AppShell and conform a11y

Wire WorkTab into the AppShell rail content dispatch under the work tab id and confirm the four-tab strip preserves role=tablist, aria-selected, and keyboard tab order across all four tabs.

- [x] `P03.S11` - Import WorkTab into AppShell and render it in the work tab content branch; `frontend/src/app/AppShell.tsx`.
- [x] `P03.S12` - Confirm the work tab button carries role=tab and aria-selected reflecting the active tab like the other three tabs; `frontend/src/app/AppShell.tsx`.
- [x] `P03.S13` - Confirm the four-tab strip preserves keyboard tab order with the work tab reachable second in sequence; `frontend/src/app/AppShell.tsx`.
- [x] `P03.S14` - Confirm the role=tablist container keeps its aria-label and the four tabs render contiguously inside it; `frontend/src/app/AppShell.tsx`.

### Phase `P04` - tests and final green gate

Extend rail tests for the four-tab strip and the WorkTab frame, add a WorkTab render test, and run the full frontend lint gate plus vitest to a clean green before review.

- [x] `P04.S15` - Extend the rail unit tests to assert the RAIL_TABS strip is exactly now, work, changes, search in that order; `frontend/src/app/right/rail.test.ts`.
- [x] `P04.S16` - Add a WorkTab render test asserting the degraded state renders when the stores selector reports the work pillar unavailable; `frontend/src/app/right/WorkTab.render.test.tsx`.
- [x] `P04.S17` - Add a WorkTab render test asserting the empty state renders when the work pillar is available with no in-flight work; `frontend/src/app/right/WorkTab.render.test.tsx`.
- [x] `P04.S18` - Add a WorkTab render test asserting the degraded state derives from the tiers truth and not from a bare transport error; `frontend/src/app/right/WorkTab.render.test.tsx`.
- [x] `P04.S19` - Run just dev lint frontend and confirm exit 0 including eslint, prettier format:check, and tsc; `frontend/`.
- [x] `P04.S20` - Run the frontend vitest suite and confirm the rail and WorkTab tests pass green; `frontend/`.

## Description

This plan delivers ONLY the right-rail information architecture pinned by the `dashboard-activity-rail` ADR: the rail is re-stated as the four-tab review rail, and the missing `work` pillar lands as a first-class tab. Today the rail in `AppShell.tsx` carries three tabs (`now`, `changes`, `search`) via the `RAIL_TABS` array (the `now` tab's internal id is `activity`) and a tab-content dispatch inside `ActivityRail()`. This plan refactors that strip to four tabs in the order `now`, `work`, `changes`, `search`, inserting `work` in second position between the liveness pillar and the evidence pillar, and adds a new `WorkTab.tsx` frame component in `frontend/src/app/right/`.

Scope is deliberately narrow. The `work` tab ships as a FRAME only: it renders its own designed degraded state and a designed empty state, but it does NOT build the real pipeline content (the active-ADR/plan list, the progress rings, or the wave/phase/step tree). That content is specified by the sibling `dashboard-pipeline-status` ADR and is delivered by a SEPARATE plan; this plan must not implement it. The `now`, `changes`, and `search` tabs are unchanged in membership: `now` keeps `NowStrip`, `OpsPanel`, and the selection-driven `Inspector`; `changes` keeps `ChangesOverview`; `search` keeps `SearchTab`.

The work is bound by the established layer-ownership boundaries. `WorkTab` is app chrome under `dashboard-layer-ownership`: it reads stores selector hooks only, never calls `fetch` against the engine, and never reads the raw `tiers` block. Per `degradation-is-read-from-tiers-not-guessed-from-errors`, its degraded state is gated on the per-tier availability the stores layer interprets from the `tiers` block, never inferred from a bare transport error or timeout. It introduces no new design token, no third icon family, and no new motion grammar (inherited base design-language, iconography, and motion ADRs are fixed), and its degraded and empty states are grayscale-safe so meaning is carried by shape and text first. The existing `role="tablist"` / `aria-selected` / keyboard tab-order affordance in `AppShell.tsx` is preserved across all four tabs. Grounding is the `dashboard-activity-rail` ADR (the decision) and the `dashboard-activity-rail` research (the converged two-pillar idiom and the layer-ownership map), both linked in `related:`.

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

The four phases carry hard ordering and are not parallel. P01 (the tab-strip refactor) and P02 (the WorkTab frame) both produce code P03 wires together, so P03 depends on both; the cleanest path is P02 first (so the component exists to import), then P01 can reference it. In practice P01 and P02 may proceed concurrently by a single executor since they touch different files (`AppShell.tsx` versus `WorkTab.tsx`), but P03 (wiring plus a11y conformance) must follow both, and P04 (tests plus the green gate) must be last because it asserts the finished behaviour. Within P01 the steps are sequential against one file. Within P02 the steps build one component and are sequential. Within P04, S15 through S18 author tests independently, but S19 (the lint gate) and S20 (vitest) are the final gate and run after every code and test step is complete.

## Verification

The plan is complete when every Step is closed (`- [x]`) and the following verifiable checks hold:

- The `RAIL_TABS` array in `AppShell.tsx` is exactly `now`, `work`, `changes`, `search` in that order, asserted by the extended `rail.test.ts` unit test.
- The `now` tab still renders `NowStrip`, `OpsPanel`, and `Inspector`; `changes` still renders `ChangesOverview`; `search` still renders `SearchTab` (unchanged membership), confirmed by inspection of the tab-content dispatch.
- `WorkTab.tsx` exists, reads availability through a stores selector hook only, calls no `fetch`, and reads no raw `tiers` block (conforms to `dashboard-layer-ownership`).
- `WorkTab` renders a designed degraded state gated on the stores tiers truth (not on a bare transport error), and a designed empty state for the available-but-no-work case, both asserted by `WorkTab.render.test.tsx`.
- The degraded and empty states are grayscale-safe and introduce no new token, icon family, or motion grammar.
- The four-tab strip preserves `role="tablist"`, per-tab `role="tab"` with `aria-selected`, the tablist `aria-label`, and keyboard tab order with `work` reachable second.
- `just dev lint frontend` exits 0 (eslint + prettier `format:check` + tsc) and the frontend vitest suite passes green, including the rail and WorkTab tests.
- The code reviewer signs off via `vaultspec-code-review`.
