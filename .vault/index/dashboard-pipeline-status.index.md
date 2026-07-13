---
generated: true
tags:
  - '#index'
  - '#dashboard-pipeline-status'
date: '2026-06-15'
modified: '2026-07-12'
related:
  - '[[2026-06-14-dashboard-pipeline-status-W01-P01-S01]]'
  - '[[2026-06-14-dashboard-pipeline-status-W01-P01-S02]]'
  - '[[2026-06-14-dashboard-pipeline-status-W01-P01-S03]]'
  - '[[2026-06-14-dashboard-pipeline-status-W01-P01-S04]]'
  - '[[2026-06-14-dashboard-pipeline-status-W01-P01-S05]]'
  - '[[2026-06-14-dashboard-pipeline-status-W01-P02-S06]]'
  - '[[2026-06-14-dashboard-pipeline-status-W01-P02-S07]]'
  - '[[2026-06-14-dashboard-pipeline-status-W01-P02-S08]]'
  - '[[2026-06-14-dashboard-pipeline-status-W01-P02-S09]]'
  - '[[2026-06-14-dashboard-pipeline-status-W01-P02-S10]]'
  - '[[2026-06-14-dashboard-pipeline-status-W01-P02-S11]]'
  - '[[2026-06-14-dashboard-pipeline-status-W01-P03-S12]]'
  - '[[2026-06-14-dashboard-pipeline-status-W01-P03-S13]]'
  - '[[2026-06-14-dashboard-pipeline-status-W01-P03-S14]]'
  - '[[2026-06-14-dashboard-pipeline-status-W01-P03-S15]]'
  - '[[2026-06-14-dashboard-pipeline-status-W01-P03-S16]]'
  - '[[2026-06-14-dashboard-pipeline-status-W01-P03-S17]]'
  - '[[2026-06-14-dashboard-pipeline-status-W02-P04-S18]]'
  - '[[2026-06-14-dashboard-pipeline-status-W02-P04-S19]]'
  - '[[2026-06-14-dashboard-pipeline-status-W02-P04-S20]]'
  - '[[2026-06-14-dashboard-pipeline-status-W02-P04-S21]]'
  - '[[2026-06-14-dashboard-pipeline-status-W02-P05-S22]]'
  - '[[2026-06-14-dashboard-pipeline-status-W02-P05-S23]]'
  - '[[2026-06-14-dashboard-pipeline-status-W02-P05-S24]]'
  - '[[2026-06-14-dashboard-pipeline-status-W02-P05-S25]]'
  - '[[2026-06-14-dashboard-pipeline-status-W02-P05-S26]]'
  - '[[2026-06-14-dashboard-pipeline-status-W02-P05-S27]]'
  - '[[2026-06-14-dashboard-pipeline-status-W03-P06-S28]]'
  - '[[2026-06-14-dashboard-pipeline-status-W03-P06-S29]]'
  - '[[2026-06-14-dashboard-pipeline-status-W03-P06-S30]]'
  - '[[2026-06-14-dashboard-pipeline-status-W03-P06-S31]]'
  - '[[2026-06-14-dashboard-pipeline-status-W03-P07-S32]]'
  - '[[2026-06-14-dashboard-pipeline-status-W03-P07-S33]]'
  - '[[2026-06-14-dashboard-pipeline-status-W03-P07-S34]]'
  - '[[2026-06-14-dashboard-pipeline-status-W03-P08-S35]]'
  - '[[2026-06-14-dashboard-pipeline-status-W03-P08-S36]]'
  - '[[2026-06-14-dashboard-pipeline-status-W03-P08-S37]]'
  - '[[2026-06-14-dashboard-pipeline-status-W04-P09-S38]]'
  - '[[2026-06-14-dashboard-pipeline-status-W04-P09-S39]]'
  - '[[2026-06-14-dashboard-pipeline-status-W04-P09-S40]]'
  - '[[2026-06-14-dashboard-pipeline-status-W04-P10-S41]]'
  - '[[2026-06-14-dashboard-pipeline-status-W04-P10-S42]]'
  - '[[2026-06-14-dashboard-pipeline-status-W04-P10-S43]]'
  - '[[2026-06-14-dashboard-pipeline-status-W04-P10-S44]]'
  - '[[2026-06-14-dashboard-pipeline-status-W04-P10-S45]]'
  - '[[2026-06-14-dashboard-pipeline-status-W04-P10-S46]]'
  - '[[2026-06-14-dashboard-pipeline-status-adr]]'
  - '[[2026-06-14-dashboard-pipeline-status-plan]]'
  - '[[2026-06-15-dashboard-pipeline-status-audit]]'
---

# `dashboard-pipeline-status` feature index

Auto-generated index of all documents tagged with `#dashboard-pipeline-status`.

## Documents

### adr

- `2026-06-14-dashboard-pipeline-status-adr` - `dashboard-pipeline-status` adr: `in-flight pipeline status surface (Work tab)` | (**status:** `accepted`)

### audit

- `2026-06-15-dashboard-pipeline-status-audit` - `dashboard-pipeline-status` audit: `production-data hardening verification`

### exec

- `2026-06-14-dashboard-pipeline-status-W01-P01-S01` - Add the PipelineArtifact wire type (stable node id, doc_type, title, feature_tags, dates, pipeline_phase) and the PipelineStatusResponse envelope type carrying the artifacts array plus the tiers block, snake_case as served
- `2026-06-14-dashboard-pipeline-status-W01-P01-S02` - Add the AdrStatus facet type (proposed | accepted | rejected | deprecated) and the PlanTier facet type (L1 | L2 | L3 | L4) and attach them to the PipelineArtifact type so an ADR row reads real status and a plan row reads real tier
- `2026-06-14-dashboard-pipeline-status-W01-P01-S03` - Add the PlanInterior wire type (bounded waves to phases to steps with per-container rolled-up completion, per-step checked flag, heading, and bound exec-record id) plus its truncated honesty block mirroring the GraphSlice truncated shape
- `2026-06-14-dashboard-pipeline-status-W01-P01-S04` - Add the EngineClient pipelineStatus method that GETs the bounded in-flight pipeline projection for a scope and as-of and adapts the envelope through liveAdapters
- `2026-06-14-dashboard-pipeline-status-W01-P01-S05` - Add the EngineClient planInterior method that GETs a plan node's bounded wave-phase-step interior under the node ceiling and adapts the envelope through liveAdapters
- `2026-06-14-dashboard-pipeline-status-W01-P02-S06` - Add the engineKeys.pipelineStatus cache key folding (scope, as-of) and the usePipelineStatus query hook that calls engineClient.pipelineStatus, disabled when scope is null, following the useGraphSlice pattern
- `2026-06-14-dashboard-pipeline-status-W01-P02-S07` - Add the engineKeys.planInterior cache key (plan node id) and the usePlanInterior query hook that calls engineClient.planInterior, disabled until a plan row is expanded, following the useNodeNeighbors enabled-on-id pattern
- `2026-06-14-dashboard-pipeline-status-W01-P02-S08` - Add the PipelineStatusView interface (loading, degraded, degradedTiers, reasons, artifacts) and the derivePipelineStatusView selector that reads the pipeline tier from the served block (success or error envelope, fresh error winning), modeled on deriveGraphSliceAvailability
- `2026-06-14-dashboard-pipeline-status-W01-P02-S09` - Add the usePipelineStatusView hook that wires usePipelineStatus into derivePipelineStatusView, reading tiers from data then the EngineError envelope, so the Work surface consumes interpreted truth and never the raw tiers block
- `2026-06-14-dashboard-pipeline-status-W01-P02-S10` - Add the CAPABILITY-served constants (PIPELINE_STATUS_SERVED, PLAN_INTERIOR_SERVED, ADR_STATUS_SERVED) signaling each not-yet-shipped wire capability so the surface renders a designed per-capability placeholder rather than a broken control, mirroring the CHANGED_FILES_LIST_SERVED constant
- `2026-06-14-dashboard-pipeline-status-W01-P02-S11` - Add the PlanInteriorView interface and the derivePlanInteriorView selector exposing rolled-up completion, the ordered tree, and the truncated honesty block so the step tree reads bounded-interior truncation as a designed state, never a silent partial result
- `2026-06-14-dashboard-pipeline-status-W01-P03-S12` - Serve the bounded in-flight pipeline projection from the mock engine for the fixture corpus, emitting the PipelineStatusResponse envelope with the tiers block byte-for-byte in the target wire shape
- `2026-06-14-dashboard-pipeline-status-W01-P03-S13` - Serve the bounded plan-container interior from the mock engine for a plan node, emitting the PlanInterior envelope with rolled-up completion, per-step checked flags, headings, exec-record bindings, and the truncated block when the fixture exceeds the ceiling
- `2026-06-14-dashboard-pipeline-status-W01-P03-S14` - Carry real ADR status and plan tier as doc-node facets on the mock fixture corpus so an ADR mock row reads a real status word and a plan mock row reads a real tier
- `2026-06-14-dashboard-pipeline-status-W01-P03-S15` - Add the adaptPipelineStatus and adaptPlanInterior adapters that unwrap the envelope and tolerate the live wire shape, mirroring adaptGraphSlice, so one client path serves both mock and live origins
- `2026-06-14-dashboard-pipeline-status-W01-P03-S16` - Add a consumer fidelity test that feeds a representative pipeline-status sample and a plan-interior sample through engineClient.pipelineStatus and engineClient.planInterior and asserts the adapted shape, proving mock-to-live parity per mock-mirrors-live-wire-shape
- `2026-06-14-dashboard-pipeline-status-W01-P03-S17` - Add a selector unit test asserting derivePipelineStatusView reports degraded when the pipeline tier is absent or unavailable in the served block and reads a fresh error envelope's tiers over a stale held success
- `2026-06-14-dashboard-pipeline-status-W02-P04-S18` - Replace the WorkTab frame body with the in-flight work list shell that consumes usePipelineStatusView for the active scope and maps each artifact to a row keyed on its stable node id for object constancy
- `2026-06-14-dashboard-pipeline-status-W02-P04-S19` - Add the grayscale-safe ProgressRing component rendering done/total as a tabular-numeral fraction text plus a fill-arc whose hue is redundant reinforcement, legible at 14px per the iconography gate
- `2026-06-14-dashboard-pipeline-status-W02-P04-S20` - Render the plan row: the ProgressRing, the plan title, the tier badge (L1-L4) reading the real plan-tier facet, the current pipeline phase, and a freshness stamp from the doc-node dates, using only the shared :root token tier and the two sanctioned icon families
- `2026-06-14-dashboard-pipeline-status-W02-P04-S21` - Render the plan-level progress against the existing lifecycle.progress facet as the derivable-today fallback so the plan row's ring lights up before the full pipeline projection lands, per the staged-capability degradation
- `2026-06-14-dashboard-pipeline-status-W02-P05-S22` - Add the grayscale-safe StatusPill component rendering the ADR status as a word-first pill (proposed / accepted / deprecated) with hue as redundant reinforcement only
- `2026-06-14-dashboard-pipeline-status-W02-P05-S23` - Render the ADR row as a leaf (no step tree): title, the StatusPill reading the real ADR-status facet, feature, and a freshness stamp
- `2026-06-14-dashboard-pipeline-status-W02-P05-S24` - Render the standing empty state (a clean branch with no active pipeline work) as a designed calm 'no work in flight on this branch' message, never an error or an empty void
- `2026-06-14-dashboard-pipeline-status-W02-P05-S25` - Render the degraded state from the selector's interpreted degraded flag (pipeline tier absent or unavailable) as a designed advisory notice, never guessed from a transport error
- `2026-06-14-dashboard-pipeline-status-W02-P05-S26` - Render the loading state from the selector's real pending flag tied to the query, never a perpetual spinner, going static under prefers-reduced-motion
- `2026-06-14-dashboard-pipeline-status-W02-P05-S27` - Render the per-capability designed placeholders gated on the CAPABILITY-served constants so an ADR row without real status and a plan row without the step tree show a designed placeholder rather than a broken control
- `2026-06-14-dashboard-pipeline-status-W03-P06-S28` - Add the expand/collapse affordance to the plan row that toggles the plan-container interior, lazily enabling usePlanInterior for the expanded plan node only
- `2026-06-14-dashboard-pipeline-status-W03-P06-S29` - Render the wave-phase-step tree from derivePlanInteriorView: each wave and phase carries its own rolled-up completion fraction, each step a checked/unchecked mark and its heading
- `2026-06-14-dashboard-pipeline-status-W03-P06-S30` - Add the grayscale-safe step check mark reading checked/unchecked by shape (a filled vs hollow mark) with hue redundant, distinct at 14px per the iconography gate
- `2026-06-14-dashboard-pipeline-status-W03-P06-S31` - Render the bounded-interior truncation honestly from the interior view's truncated block as a designed 'narrowed - refine' state when a large plan exceeds the node ceiling, never a silent partial tree
- `2026-06-14-dashboard-pipeline-status-W03-P07-S32` - Emit node selection intent on activating a plan row, calling the existing selectNode seam with the plan's stable node id so the stage and inspector reflect it, mirroring the SearchTab result-activation path
- `2026-06-14-dashboard-pipeline-status-W03-P07-S33` - Emit node selection intent on activating an ADR row, calling selectNode with the ADR's stable node id
- `2026-06-14-dashboard-pipeline-status-W03-P07-S34` - Emit step navigation intent on activating a step row, calling selectNode with the step's bound exec-record node id so selecting a step jumps to its exec record through the same selection seam
- `2026-06-14-dashboard-pipeline-status-W03-P08-S35` - Add the compact PipelineArc component rendering the research-to-adr-to-plan-to-execute-to-review-to-codify arc, positioning the current in-flight artifacts within it so the operator reads where in the pipeline the work sits
- `2026-06-14-dashboard-pipeline-status-W03-P08-S36` - Thread the active as-of playhead into usePipelineStatusView so the surface reflects the historical pipeline under a past playhead, consistent with the timeline ADR
- `2026-06-14-dashboard-pipeline-status-W03-P08-S37` - Fade rows in/out on add/remove with stable ids for object constancy and render keyboard-initiated and reduced-motion paths instantly, reusing the existing animated-transitions grammar without introducing a new motion grammar
- `2026-06-14-dashboard-pipeline-status-W04-P09-S38` - Add the list/row ARIA semantics and a single polite live region announcing the settled outcome (in-flight count, empty, degraded, loading) so a screen reader hears the state without sighted scanning, mirroring the SearchTab live-region pattern
- `2026-06-14-dashboard-pipeline-status-W04-P09-S39` - Add roving-tabindex keyboard navigation across rows and an accessible expand/collapse control (aria-expanded, aria-controls) for the plan row's step tree, deriving the focus order from the DOM at event time per the in-repo roving pattern
- `2026-06-14-dashboard-pipeline-status-W04-P09-S40` - Add accessible names to the ProgressRing, StatusPill, step check mark, and PipelineArc so progress, status, completion, and pipeline position read by text to assistive tech, not by hue alone
- `2026-06-14-dashboard-pipeline-status-W04-P10-S41` - Add render tests asserting the plan row (ring, title, tier, phase, freshness) and the leaf ADR row (title, status pill, feature, freshness) render from the mock-backed selector
- `2026-06-14-dashboard-pipeline-status-W04-P10-S42` - Add render tests asserting the standing empty, degraded, loading, and per-capability placeholder states each render their designed surface and never an error void
- `2026-06-14-dashboard-pipeline-status-W04-P10-S43` - Add render tests asserting the expandable step tree shows rolled-up completion and checked/unchecked marks and renders honest truncation when the interior is capped
- `2026-06-14-dashboard-pipeline-status-W04-P10-S44` - Add render tests asserting activating a plan row, an ADR row, and a step row each emit the expected selectNode intent through the selection seam
- `2026-06-14-dashboard-pipeline-status-W04-P10-S45` - Add a grayscale-safe gate test asserting the ProgressRing, StatusPill, and step check mark stay distinct by shape and text at 14px with hue removed
- `2026-06-14-dashboard-pipeline-status-W04-P10-S46` - Run the full lint gate to exit 0 and vitest green, confirming the surface conforms to every state the dashboard-pipeline-status ADR names

### plan

- `2026-06-14-dashboard-pipeline-status-plan` - `dashboard-pipeline-status` plan
