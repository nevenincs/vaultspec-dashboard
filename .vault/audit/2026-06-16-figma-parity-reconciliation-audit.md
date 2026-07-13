---
tags:
  - '#audit'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-07-12'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
  - "[[2026-06-16-figma-parity-reconciliation-adr]]"
  - "[[2026-06-16-figma-parity-reconciliation-research]]"
---

# `figma-parity-reconciliation` audit: `Figma parity reconciliation: W04 Phase-5 verification`

## Scope

The Phase-5 verification review of the `figma-parity-reconciliation` feature — the final
wave's parity steps (chrome parity `W04.P11.S67` and headline-canvas parity
`W04.P11.S68`) plus a feature-wide audit of the rewritten view layer. The rewrite replaced
`frontend/src/app/` (all chrome) and `frontend/src/scene/` (the headline node-connection
canvas) against the binding Figma file `SlhonORmySdoSMTQgDWw3w`, consuming the preserved
`frontend/src/stores/` hooks and the `SceneController` command/event contract unchanged.
The review verified five dimensions against the load-bearing rules: layer-ownership /
preserved-contract, the OKLCH literal-hex scene-token seam, the two-family icon
discipline, the W04.P10 binding-treatment supersessions honored in code, and the green
gate. The figma read tools are unreachable inside review sub-agents, so parity was verified
against the binding-frame specifications recorded in the research, ADR, and execution
records rather than live screenshots; visual parity was confirmed in the running app during
the W02/W03 build waves.

## Findings

**Overall verdict: PASS-WITH-NITS.** No CRITICAL or HIGH findings; no revision requested.
`S68` (canvas parity) is a clean PASS; `S67` (chrome parity) is PASS-WITH-NITS on the one
MEDIUM below.

- **Dimension 1 — Layer ownership / preserved contract: PASS.** No production `fetch(` in
  app or scene (every match is a test-only transport binding or a comment); no raw `tiers`
  degradation-block reads (every `.tiers` reference is store-derived availability, relation
  tiers via `edgesByTier`, or the filter store's tier-toggle selector); no new client model
  minted (all `stores/server/engine` imports in production app/scene files are `import
  type` over the frozen wire types); the `SceneController` command union and event channel
  are intact and unwidened.
- **Dimension 2 — Theme/token seam: PASS.** The single scene-color seam in
  `field/tokenReads.ts` reads via `getComputedStyle().getPropertyValue()` and accepts only
  a `#rrggbb` literal (else fallback), exactly per `themes-are-oklch-generated-from-a-token-tier`;
  `categoryColor.ts` and `edgeMeshes.ts` resolve through it, never a `var()` chain. Zero
  ad-hoc hex or inline `fontSize` numbers across the chrome.
- **Dimension 3 — Icons: PASS.** Every icon import resolves to `lucide-react` (chrome) or
  `@phosphor-icons` (domain marks); no third family.
- **Dimension 4 — Binding-treatment fidelity: PASS.** Category-colored circles (NOT
  silhouette status stamps), flat-grey edges (NOT tier-color), salience-sized radii from
  the engine-served DOI scalar, three node states with a single-accent selection ring, and
  the plain-language Navigate/Layout/Zoom/Tune controls — each implemented and
  self-documented in the scene module headers with the binding frame ID and the
  supersession note. The W04.P10 supersessions are honored precisely; tier/status DATA is
  retained for geometry and filtering.
- **Dimension 5 — Green gate: confirmed.** `just dev lint frontend` and `just dev lint
  rust` were both exit 0 this session.

- **MEDIUM — Rail IA plan-parity tension (traceability, not a code defect).** The shipped
  right-rail tab IA is `Status | Inspect | Search | Changes` (codified in
  `rail.test.ts`), whereas the figma-parity ADR, research F3, and plan `W04.P11`'s upstream
  `S28` deliverable specify `Inspect | Work | Search | Changes`. There is no separate
  "Work" tab — the in-flight-plan model is folded into the Status surface (`StatusTab`
  composes `PlanStepTree`/`ProgressRing` from the Work module), so the Work data is
  relocated, NOT orphaned. The shipped IA is governed by the separately-accepted
  `2026-06-16-status-overview-adr` and `2026-06-16-review-rail-viewers-adr` (both accepted
  the same day, deliberately re-scoping the rail to a Status-overview-primary IA that
  refines the activity-rail decision). The code follows an accepted ADR, is internally
  consistent and tested; the defect is purely that the figma-parity plan/ADR's rail-IA
  deliverable was overtaken by a later ADR and never annotated, so an auditor reading the
  plan-as-written against the code finds a false divergence.
- **LOW-1 — Zoom control is a flagged two-stop approximation.** The Zoom affordance snaps
  to two stops because the scene seam exposes no absolute-zoom command; a continuous slider
  faithful to Figma would need a new `SceneController` command (a deliberate, out-of-scope
  contract event). Honestly flagged in-code.
- **LOW-2 — `center`/gravity force knob has no plain-language control slot.** A known UI
  gap (not a backend gap), flagged in-code and in research F4.

## Recommendations

- **Action the MEDIUM (this orchestrator, governance):** annotate the figma-parity ADR's
  rail-IA supersession with a one-line back-reference noting the rail IA ultimately landed
  per the later `2026-06-16-status-overview-adr` (`Status | Inspect | Search | Changes`,
  Work folded into Status), so plan-as-written no longer reads as a divergence from the
  code. No executor code revision is required.
- **LOW-1 / LOW-2:** leave as documented out-of-scope gaps; both are honest in-code flags
  and would each require a deliberate `SceneController` contract event or a new control
  slot, tracked for a future iteration.
- **Close the wave:** with `S67`/`S68` verified, `S64`/`S65` gates green, and `S66` Code
  Connect dry-run valid, the only remaining step is the human-gated `S66` publish.

## Codification candidates

None. The two candidates this feature surfaced — `figma-is-the-binding-source-of-truth`
and `view-rewrite-preserves-the-state-and-scene-contract` — were already codified in
`W04.P10.S62`/`S63`, and the review confirmed both are in force across the rewritten layer.
The strong scene-module-header discipline (every rewritten file opening with the binding
frame ID, the rule citations, and the supersession note) is already covered by the existing
design-system and layer-ownership rules; no new promotion is warranted. An empty section
here is the expected, positive outcome for a feature whose durable lessons were codified
during execution.
