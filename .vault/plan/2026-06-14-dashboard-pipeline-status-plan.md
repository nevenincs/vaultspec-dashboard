---
tags:
  - '#plan'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-06-15'
tier: L3
related:
  - '[[2026-06-14-dashboard-pipeline-status-adr]]'
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
     Replace dashboard-pipeline-status with a kebab-case feature tag, e.g. #foo-bar.
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

# `dashboard-pipeline-status` plan

Build the right rail `work` tab content - the in-flight pipeline-status surface - as app chrome plus one stores selector, consuming the pipeline wire, degrading honestly, never touching the engine.

## Description

This plan implements the frontend `work` tab content specified by the `dashboard-pipeline-status` ADR: the standing, in-flight pipeline-status surface that answers what work is being worked on in the current workspace and branch. It is strictly app chrome plus a single new stores selector. The surface never fetches the engine and never reads the raw `tiers` block; it consumes the sibling `dashboard-pipeline-wire` endpoints (the bounded in-flight projection, the bounded plan-container interior, and the ADR/plan frontmatter status and tier facets) through one new stores query hook and a tiers-reading availability selector, then renders a dumb view that emits selection and navigation intent back through the existing selection seam. It is a projection over the one model, not a new model (`views-are-projections-of-one-model`, `dashboard-layer-ownership`).

The surface renders plan rows (a grayscale-safe progress ring carrying done/total as text plus a fill arc, the title, the tier `L1`-`L4`, the current pipeline phase, and freshness), each expandable into a wave to phase to step tree with rolled-up per-container completion, per-step checked/unchecked marks and headings, and honest truncation when the bounded interior is capped (`graph-queries-are-bounded-by-default`). It renders ADR rows (title, a word-first real status pill of proposed / accepted / deprecated, feature, and freshness) as leaves. It renders a compact `research` to `codify` pipeline-arc cue positioning the current artifacts. It renders the standing empty designed state, the tiers-driven degraded state, real-pending loading, and per-capability designed placeholders, and it reflects time-travel under a past playhead. Degradation is read from the `tiers` block via the selector, never guessed from a transport error (`degradation-is-read-from-tiers-not-guessed-from-errors`, `every-wire-response-carries-the-tiers-block`). No new token, icon family, or motion grammar is introduced; the surface consumes the shared `:root` tier and the two sanctioned icon families with grayscale-safe identity (`icons-come-from-the-two-sanctioned-families`, `warmth-lives-in-tokens-not-decoration`). The new wire shapes are mirrored byte-for-byte in the mock engine and exercised through the same client path the app uses (`mock-mirrors-live-wire-shape`).

Grounding read before writing: the `dashboard-pipeline-status` ADR (the surface), the `dashboard-activity-rail` ADR (the rail frame that hosts the `work` tab), the `dashboard-pipeline-wire` ADR (the engine wire this consumes), and the `dashboard-activity-rail` research. The selector and client patterns follow the shipped `deriveGitStatusView`, `deriveRagStatusView`, and `deriveGraphSliceAvailability` selectors in `frontend/src/stores/server/queries.ts`, the client in `frontend/src/stores/server/engine.ts`, the mock in `frontend/src/testing/mockEngine.ts` and `frontend/src/stores/server/liveAdapters.ts`, and the selection seam `selectNode` in `frontend/src/stores/view/selection.ts` already consumed by the Inspector and `SearchTab`.

## Steps

## Wave `W01` - stores seam - pipeline-status selector, client methods, mock fidelity

Lands the single wire seam the Work surface consumes: a new pipeline-status stores query hook and a tiers-reading availability selector following the `deriveGitStatusView` / `deriveRagStatusView` / `deriveGraphSliceAvailability` patterns, the EngineClient methods for the new pipeline-wire endpoints, and the mock-engine plus liveAdapters shapes mirroring the target wire byte-for-byte with a consumer test through the same client path. Every downstream Wave depends on this Wave; it can be built against the mock before the live engine wire (`dashboard-pipeline-wire`) lands, with the live path gated on that wire. Backed by the `dashboard-pipeline-status` ADR and the `dashboard-activity-rail` research.

### Phase `W01.P01` - wire types and EngineClient methods

Add the snake-case wire types and the EngineClient methods for the pipeline-status endpoints (in-flight projection, plan-container interior, frontmatter status/tier facets) so the client surface speaks the target wire.

- [x] `W01.P01.S01` - Add the PipelineArtifact wire type (stable node id, doc_type, title, feature_tags, dates, pipeline_phase) and the PipelineStatusResponse envelope type carrying the artifacts array plus the tiers block, snake_case as served; `frontend/src/stores/server/engine.ts`.
- [x] `W01.P01.S02` - Add the AdrStatus facet type (proposed | accepted | rejected | deprecated) and the PlanTier facet type (L1 | L2 | L3 | L4) and attach them to the PipelineArtifact type so an ADR row reads real status and a plan row reads real tier; `frontend/src/stores/server/engine.ts`.
- [x] `W01.P01.S03` - Add the PlanInterior wire type (bounded waves to phases to steps with per-container rolled-up completion, per-step checked flag, heading, and bound exec-record id) plus its truncated honesty block mirroring the GraphSlice truncated shape; `frontend/src/stores/server/engine.ts`.
- [x] `W01.P01.S04` - Add the EngineClient pipelineStatus method that GETs the bounded in-flight pipeline projection for a scope and as-of and adapts the envelope through liveAdapters; `frontend/src/stores/server/engine.ts`.
- [x] `W01.P01.S05` - Add the EngineClient planInterior method that GETs a plan node's bounded wave-phase-step interior under the node ceiling and adapts the envelope through liveAdapters; `frontend/src/stores/server/engine.ts`.

### Phase `W01.P02` - pipeline-status query hook and tiers-reading availability selector

Add the TanStack query hook plus the derivePipelineStatusView availability selector that reads degradation from the tiers block, following the deriveGitStatusView/deriveRagStatusView/deriveGraphSliceAvailability patterns.

- [x] `W01.P02.S06` - Add the engineKeys.pipelineStatus cache key folding (scope, as-of) and the usePipelineStatus query hook that calls engineClient.pipelineStatus, disabled when scope is null, following the useGraphSlice pattern; `frontend/src/stores/server/queries.ts`.
- [x] `W01.P02.S07` - Add the engineKeys.planInterior cache key (plan node id) and the usePlanInterior query hook that calls engineClient.planInterior, disabled until a plan row is expanded, following the useNodeNeighbors enabled-on-id pattern; `frontend/src/stores/server/queries.ts`.
- [x] `W01.P02.S08` - Add the PipelineStatusView interface (loading, degraded, degradedTiers, reasons, artifacts) and the derivePipelineStatusView selector that reads the pipeline tier from the served block (success or error envelope, fresh error winning), modeled on deriveGraphSliceAvailability; `frontend/src/stores/server/queries.ts`.
- [x] `W01.P02.S09` - Add the usePipelineStatusView hook that wires usePipelineStatus into derivePipelineStatusView, reading tiers from data then the EngineError envelope, so the Work surface consumes interpreted truth and never the raw tiers block; `frontend/src/stores/server/queries.ts`.
- [x] `W01.P02.S10` - Add the CAPABILITY-served constants (PIPELINE_STATUS_SERVED, PLAN_INTERIOR_SERVED, ADR_STATUS_SERVED) signaling each not-yet-shipped wire capability so the surface renders a designed per-capability placeholder rather than a broken control, mirroring the CHANGED_FILES_LIST_SERVED constant; `frontend/src/stores/server/queries.ts`.
- [x] `W01.P02.S11` - Add the PlanInteriorView interface and the derivePlanInteriorView selector exposing rolled-up completion, the ordered tree, and the truncated honesty block so the step tree reads bounded-interior truncation as a designed state, never a silent partial result; `frontend/src/stores/server/queries.ts`.

### Phase `W01.P03` - mock fidelity and the consumer fidelity test

Mirror the new wire shapes byte-for-byte in the mock engine and liveAdapters, and prove fidelity by feeding a representative sample through the same client path the app uses.

- [x] `W01.P03.S12` - Serve the bounded in-flight pipeline projection from the mock engine for the fixture corpus, emitting the PipelineStatusResponse envelope with the tiers block byte-for-byte in the target wire shape; `frontend/src/testing/mockEngine.ts`.
- [x] `W01.P03.S13` - Serve the bounded plan-container interior from the mock engine for a plan node, emitting the PlanInterior envelope with rolled-up completion, per-step checked flags, headings, exec-record bindings, and the truncated block when the fixture exceeds the ceiling; `frontend/src/testing/mockEngine.ts`.
- [x] `W01.P03.S14` - Carry real ADR status and plan tier as doc-node facets on the mock fixture corpus so an ADR mock row reads a real status word and a plan mock row reads a real tier; `frontend/src/testing/fixtures/corpus.ts`.
- [x] `W01.P03.S15` - Add the adaptPipelineStatus and adaptPlanInterior adapters that unwrap the envelope and tolerate the live wire shape, mirroring adaptGraphSlice, so one client path serves both mock and live origins; `frontend/src/stores/server/liveAdapters.ts`.
- [x] `W01.P03.S16` - Add a consumer fidelity test that feeds a representative pipeline-status sample and a plan-interior sample through engineClient.pipelineStatus and engineClient.planInterior and asserts the adapted shape, proving mock-to-live parity per mock-mirrors-live-wire-shape; `frontend/src/stores/server/liveAdapters.pipeline.test.ts`.
- [x] `W01.P03.S17` - Add a selector unit test asserting derivePipelineStatusView reports degraded when the pipeline tier is absent or unavailable in the served block and reads a fresh error envelope's tiers over a stale held success; `frontend/src/stores/server/queries.test.ts`.

## Wave `W02` - Work surface - plan rows, ADR rows, and the standing states

Fills the WorkTab frame (created as a frame by the dashboard-activity-rail plan) with the in-flight work list: plan rows carrying a grayscale-safe progress ring, title, tier, pipeline phase, and freshness, and ADR rows carrying title, a word-first real status pill, feature, and freshness. Includes the standing empty designed state, the tiers-driven degraded state, the real-pending loading state, and the per-capability designed placeholders. Depends on W01 for the selector and wire shapes. Backed by the dashboard-pipeline-status ADR and the dashboard-activity-rail research.

### Phase `W02.P04` - Work surface scaffold and plan rows

Fill the WorkTab frame with the in-flight work list and render plan rows: progress ring, title, tier, pipeline phase, freshness.

- [x] `W02.P04.S18` - Replace the WorkTab frame body with the in-flight work list shell that consumes usePipelineStatusView for the active scope and maps each artifact to a row keyed on its stable node id for object constancy; `frontend/src/app/right/WorkTab.tsx`.
- [x] `W02.P04.S19` - Add the grayscale-safe ProgressRing component rendering done/total as a tabular-numeral fraction text plus a fill-arc whose hue is redundant reinforcement, legible at 14px per the iconography gate; `frontend/src/app/right/WorkTab.tsx`.
- [x] `W02.P04.S20` - Render the plan row: the ProgressRing, the plan title, the tier badge (L1-L4) reading the real plan-tier facet, the current pipeline phase, and a freshness stamp from the doc-node dates, using only the shared :root token tier and the two sanctioned icon families; `frontend/src/app/right/WorkTab.tsx`.
- [x] `W02.P04.S21` - Render the plan-level progress against the existing lifecycle.progress facet as the derivable-today fallback so the plan row's ring lights up before the full pipeline projection lands, per the staged-capability degradation; `frontend/src/app/right/WorkTab.tsx`.

### Phase `W02.P05` - ADR rows and the standing states

Render leaf ADR rows with a real-status pill, and the standing empty, degraded, loading, and per-capability placeholder states.

- [x] `W02.P05.S22` - Add the grayscale-safe StatusPill component rendering the ADR status as a word-first pill (proposed / accepted / deprecated) with hue as redundant reinforcement only; `frontend/src/app/right/WorkTab.tsx`.
- [x] `W02.P05.S23` - Render the ADR row as a leaf (no step tree): title, the StatusPill reading the real ADR-status facet, feature, and a freshness stamp; `frontend/src/app/right/WorkTab.tsx`.
- [x] `W02.P05.S24` - Render the standing empty state (a clean branch with no active pipeline work) as a designed calm 'no work in flight on this branch' message, never an error or an empty void; `frontend/src/app/right/WorkTab.tsx`.
- [x] `W02.P05.S25` - Render the degraded state from the selector's interpreted degraded flag (pipeline tier absent or unavailable) as a designed advisory notice, never guessed from a transport error; `frontend/src/app/right/WorkTab.tsx`.
- [x] `W02.P05.S26` - Render the loading state from the selector's real pending flag tied to the query, never a perpetual spinner, going static under prefers-reduced-motion; `frontend/src/app/right/WorkTab.tsx`.
- [x] `W02.P05.S27` - Render the per-capability designed placeholders gated on the CAPABILITY-served constants so an ADR row without real status and a plan row without the step tree show a designed placeholder rather than a broken control; `frontend/src/app/right/WorkTab.tsx`.

## Wave `W03` - Depth and navigation - step tree, selection intent, pipeline-arc, time-travel

Adds the plan row's expandable wave to phase to step tree with rolled-up completion and honest bounded-interior truncation, the navigation intent that opens a plan/ADR node on the stage and jumps a step to its exec record through the existing selection seam, the compact research-to-codify pipeline-arc cue positioning the current artifacts, and the time-travel reflection so the surface shows the historical pipeline under a past playhead. Depends on W02 for the rows and on W01 for the bounded plan-container interior shape. Backed by the dashboard-pipeline-status ADR.

### Phase `W03.P06` - expandable wave-phase-step tree

Add the plan row's expandable wave to phase to step tree with rolled-up completion and honest bounded-interior truncation.

- [x] `W03.P06.S28` - Add the expand/collapse affordance to the plan row that toggles the plan-container interior, lazily enabling usePlanInterior for the expanded plan node only; `frontend/src/app/right/WorkTab.tsx`.
- [x] `W03.P06.S29` - Render the wave-phase-step tree from derivePlanInteriorView: each wave and phase carries its own rolled-up completion fraction, each step a checked/unchecked mark and its heading; `frontend/src/app/right/WorkTab.tsx`.
- [x] `W03.P06.S30` - Add the grayscale-safe step check mark reading checked/unchecked by shape (a filled vs hollow mark) with hue redundant, distinct at 14px per the iconography gate; `frontend/src/app/right/WorkTab.tsx`.
- [x] `W03.P06.S31` - Render the bounded-interior truncation honestly from the interior view's truncated block as a designed 'narrowed - refine' state when a large plan exceeds the node ceiling, never a silent partial tree; `frontend/src/app/right/WorkTab.tsx`.

### Phase `W03.P07` - selection and navigation intent

Emit navigation intent through the existing selection seam: open a plan/ADR node on the stage, jump a step to its exec record.

- [x] `W03.P07.S32` - Emit node selection intent on activating a plan row, calling the existing selectNode seam with the plan's stable node id so the stage and inspector reflect it, mirroring the SearchTab result-activation path; `frontend/src/app/right/WorkTab.tsx`.
- [x] `W03.P07.S33` - Emit node selection intent on activating an ADR row, calling selectNode with the ADR's stable node id; `frontend/src/app/right/WorkTab.tsx`.
- [x] `W03.P07.S34` - Emit step navigation intent on activating a step row, calling selectNode with the step's bound exec-record node id so selecting a step jumps to its exec record through the same selection seam; `frontend/src/app/right/WorkTab.tsx`.

### Phase `W03.P08` - pipeline-arc cue and time-travel reflection

Render the compact research-to-codify pipeline-arc positioning current artifacts, and reflect the historical pipeline under a past playhead.

- [x] `W03.P08.S35` - Add the compact PipelineArc component rendering the research-to-adr-to-plan-to-execute-to-review-to-codify arc, positioning the current in-flight artifacts within it so the operator reads where in the pipeline the work sits; `frontend/src/app/right/WorkTab.tsx`.
- [x] `W03.P08.S36` - Thread the active as-of playhead into usePipelineStatusView so the surface reflects the historical pipeline under a past playhead, consistent with the timeline ADR; `frontend/src/app/right/WorkTab.tsx`.
- [x] `W03.P08.S37` - Fade rows in/out on add/remove with stable ids for object constancy and render keyboard-initiated and reduced-motion paths instantly, reusing the existing animated-transitions grammar without introducing a new motion grammar; `frontend/src/app/right/WorkTab.tsx`.

## Wave `W04` - Accessibility, tests, and the green gate

Hardens the surface: keyboard and screen-reader access for the list, rows, expand/collapse, and the arc; the consumer and render test suite proving states and mock-to-live fidelity; and the full lint gate plus vitest green with the surface conforming to every state the dashboard-pipeline-status ADR names. Depends on all prior Waves. Backed by the dashboard-pipeline-status ADR.

### Phase `W04.P09` - accessibility

Keyboard and screen-reader access for the list, rows, expand/collapse, and the pipeline-arc.

- [x] `W04.P09.S38` - Add the list/row ARIA semantics and a single polite live region announcing the settled outcome (in-flight count, empty, degraded, loading) so a screen reader hears the state without sighted scanning, mirroring the SearchTab live-region pattern; `frontend/src/app/right/WorkTab.tsx`.
- [x] `W04.P09.S39` - Add roving-tabindex keyboard navigation across rows and an accessible expand/collapse control (aria-expanded, aria-controls) for the plan row's step tree, deriving the focus order from the DOM at event time per the in-repo roving pattern; `frontend/src/app/right/WorkTab.tsx`.
- [x] `W04.P09.S40` - Add accessible names to the ProgressRing, StatusPill, step check mark, and PipelineArc so progress, status, completion, and pipeline position read by text to assistive tech, not by hue alone; `frontend/src/app/right/WorkTab.tsx`.

### Phase `W04.P10` - tests and the green gate

Render and consumer test coverage for every ADR state, then the full lint gate and vitest green.

- [x] `W04.P10.S41` - Add render tests asserting the plan row (ring, title, tier, phase, freshness) and the leaf ADR row (title, status pill, feature, freshness) render from the mock-backed selector; `frontend/src/app/right/WorkTab.render.test.tsx`.
- [x] `W04.P10.S42` - Add render tests asserting the standing empty, degraded, loading, and per-capability placeholder states each render their designed surface and never an error void; `frontend/src/app/right/WorkTab.render.test.tsx`.
- [x] `W04.P10.S43` - Add render tests asserting the expandable step tree shows rolled-up completion and checked/unchecked marks and renders honest truncation when the interior is capped; `frontend/src/app/right/WorkTab.render.test.tsx`.
- [x] `W04.P10.S44` - Add render tests asserting activating a plan row, an ADR row, and a step row each emit the expected selectNode intent through the selection seam; `frontend/src/app/right/WorkTab.render.test.tsx`.
- [x] `W04.P10.S45` - Add a grayscale-safe gate test asserting the ProgressRing, StatusPill, and step check mark stay distinct by shape and text at 14px with hue removed; `frontend/src/app/right/WorkTab.render.test.tsx`.
- [x] `W04.P10.S46` - Run the full lint gate to exit 0 and vitest green, confirming the surface conforms to every state the dashboard-pipeline-status ADR names; `just dev lint frontend`.

## Parallelization

The four Waves are sequenced: `W01` (the stores seam) must land before any surface Wave because the Work view consumes its selector and wire shapes; `W02` (rows and standing states) before `W03` (depth and navigation), which extends those rows; `W04` (accessibility, tests, green gate) closes over all prior Waves. Within `W01`, Phase `W01.P01` (wire types and client) precedes `W01.P02` (the query hook and selector that import those types) which precedes `W01.P03` (the mock and fidelity test that exercise both). Within `W02`, Phase `W02.P04` (scaffold and plan rows) and `W02.P05` (ADR rows and standing states) share the `WorkTab.tsx` file and so are executed in sequence, not in parallel, to avoid edit contention. Within `W03` the three Phases (step tree, navigation, pipeline-arc and time-travel) all touch `WorkTab.tsx` and are likewise sequential; `W03.P07` navigation depends on the rows and the tree being present.

Cross-plan dependency: this plan depends on the `work` tab frame created by the `dashboard-activity-rail` plan (the `WorkTab.tsx` frame this plan fills with content) and on the engine wire built by the `dashboard-pipeline-wire` plan. Frontend work can and should proceed against the mock (`W01.P03` mirrors the target wire shape) before the live engine lands - the mock is the cross-plan fence that lets `W02`, `W03`, and the `W04` render tests complete with the live engine still in flight. The live path is gated on the `dashboard-pipeline-wire` plan: the per-capability served constants (`W01.P02.S10`) keep each not-yet-shipped capability rendering a designed placeholder, and the surface lights up incrementally as the wire's ADR-status, in-flight-projection, and plan-container-interior capabilities each land. Final live verification (`W04.P10.S46` against the live origin) cannot be declared green until the wire is present.

## Verification

The plan is complete when every Step is closed (`- [x]`) and the following verifiable checks hold:

- The pipeline-status query hook and the `derivePipelineStatusView` selector read degradation from the served `tiers` block (success or error envelope, fresh error winning), never from a bare transport error; proven by the selector unit test (`W01.P03.S17`).
- The new wire shapes are mirrored byte-for-byte in the mock engine and a representative sample passes unchanged through the same client path the app uses; proven by the consumer fidelity test (`W01.P03.S16`).
- The `WorkTab.tsx` surface never calls `fetch` and never reads the raw `tiers` block; it consumes the stores selector and emits selection and navigation intent only through the existing `selectNode` seam; confirmed by reviewer against `dashboard-layer-ownership` and `views-are-projections-of-one-model`.
- The surface renders every state the ADR names - plan rows, leaf ADR rows, the expandable wave-phase-step tree with rolled-up completion and honest bounded-interior truncation, the pipeline-arc, the standing empty state, the tiers-driven degraded state, real-pending loading, the per-capability placeholders, and the historical time-travel view; proven by the render-test suite (`W04.P10.S41` through `W04.P10.S44`).
- Progress ring, status pill, and step check mark stay distinct by shape and text at 14px with hue removed; proven by the grayscale-safe gate test (`W04.P10.S45`).
- The full lint gate (`just dev lint frontend` - eslint + prettier + tsc) exits 0 and vitest is green (`W04.P10.S46`), per `declaring-green-runs-the-full-gate`.

For tier-specific verification cadence, see the authorizing documents linked in the `related:` frontmatter.
