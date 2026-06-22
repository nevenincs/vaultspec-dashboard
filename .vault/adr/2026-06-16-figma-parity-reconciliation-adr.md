---
tags:
  - "#adr"
  - "#figma-parity-reconciliation"
date: '2026-06-16'
related:
  - "[[2026-06-16-figma-parity-reconciliation-research]]"
supersedes:
  - '2026-06-14-dashboard-activity-rail-adr'
modified: '2026-06-22'
---


# `figma-parity-reconciliation` adr: `Figma-binding frontend rewrite and reconciliation` | (**status:** `accepted`)

<!-- Accepted 2026-06-16 with user sign-off. Diff-scope decision: build the bounded historical/committed-range text-diff route (in scope). -->>

## Problem Statement

The Figma file is now the single binding source of truth for the dashboard's design — its
foundation (color, type, spacing, radius, elevation), its surfaces, and its headline
node-connection canvas. The local frontend view layer does not match it and is judged not
worth preserving; the directive is a complete rewrite of the view against the designs. Two
layers are explicitly precious and stay: the client state system (the TanStack query
cache, the streaming delta clock, the per-scope view stores, the wire client, and the
scene command contract) and the entire read-and-infer engine/backend. The reconciliation
research surfaced real gaps (a whole-taxonomy divergence in type/radius/elevation, a
missing non-color token pipeline, two engine shape/capability gaps) and a governance
conflict (the codified rules say code is canonical, the opposite of "Figma is binding").
Before earnest view-rewrite work can begin it needs a STABLE foundation to build against:
a settled source-of-truth direction, a closed token pipeline, the preserved state/engine
contract frozen as the rewrite's API, the few backend base features the designs require,
and a live Code Connect linkage from code components to the Figma Kit. This ADR maps that
backend and frontend base-feature scope and the reconciliation actions.

## Considerations

- **Layer ownership is the enabling structure.** The four-layer model — engine backbone,
  `frontend/src/stores/` state, `frontend/src/scene/` + `frontend/src/app/` view —
  enforces one-way boundaries where the view is a pure projection over the stores model
  and the scene receives data only through `SceneController` commands. That boundary is
  what makes a view rewrite safe: the face is replaced without touching the nervous system
  or the backbone.
- **What stays (precious):** the engine (Rust workspace) and `frontend/src/stores/` in
  full — the query/cache layer, the SSE delta clock, the `tiers` degradation reads, the
  view stores (selection, filters, browser mode, pins), and the `SceneController`
  command/event channel. These are frozen as the contract the rewritten view consumes; the
  rewrite adds no new fetch and mints no new model.
- **What is rewritten:** `frontend/src/app/` (all chrome) and `frontend/src/scene/` (the
  custom node-connection canvas — the headline), rebuilt from the binding frames,
  consuming the preserved hooks and commands unchanged.
- **Backend is in strong parity already** (research F2): per-node category and a real
  degree-of-interest salience are engine-served; the layout-mode catalog, discover, the
  vault-tree progress, and the settings schema are served. The rewrite can proceed against
  a stable backend with only a small, bounded set of backend base features to add.
- **Figma is binding** across every token family, including the families with no generator
  today (type, spacing, radius, elevation) and the fonts (Inter, JetBrains Mono) that code
  currently substitutes with a system stack.

## Constraints

- **Governance must flip first.** The rule `themes-are-oklch-generated-from-a-token-tier`
  and `frontend/tokens/FIGMA-SYNC.md` assert code-canonical, one-way-to-Figma; "Figma is
  binding" inverts that. This ADR supersedes that direction; the rule and sync doc are
  amended so foundation constants are authored to match Figma and the non-color families
  gain a generator. Nothing downstream is unambiguous until this lands.
- **The preserved contract is the hard boundary.** The rewrite may not alter
  `frontend/src/stores/` shapes or the `SceneController` command surface except through a
  deliberate, reviewed contract change; scene-read tokens must stay literal hex resolvable
  by `getComputedStyle` (the established scene seam).
- **Code Connect specifics:** authoring and publish run through the `@figma/code-connect`
  CLI, not the MCP tools (Org/Enterprise-gated on this Pro seat); publish targets must be
  Figma `COMPONENT`/`COMPONENT_SET` nodes, which in the live file are the Kit primitives
  (frame `135:2`), not the composed-screen frames; publish needs a personal access token
  (gitignored `frontend/.env`) and is plan-gated, so it is the human's one-command step.
- **Diff scope — decided (in scope).** The binding DiffView reserves an "engine capability
  pending" state. The working-tree text diff is already served; a historical/committed-range
  or `.vault`-content text diff has no engine route. Per sign-off, the designs require
  historical diffs, so a new bounded read-only historical text-diff route IS in scope
  (read-and-infer: a two-rev `git diff` extension or a blob-pair diff over the git object
  DB; no vault writes, no ref mutation).
- **Effort / frontier risk:** the headline custom canvas is a large bespoke rendering
  effort (faithful translation of the node-connection field, salience sizing, the three
  node states, the controls); it is the dominant cost and should be its own wave.

## Implementation

The work establishes a stable foundation, then rewrites the view on top of it. This is
layering, not sequence detail (the plan owns sequence):

- **Foundation — frontend base.** Close the non-color token pipeline so type, spacing,
  radius, and elevation are authored as DTCG tokens, generated into the stylesheet, and
  mirrored to Figma exactly as color already is; adopt the Figma foundation across every
  family (role-named type scale, `xs/sm/md/lg/pill` radius, three-level elevation, Inter +
  JetBrains Mono). The result is one design-system foundation the rewritten components
  consume, with parity mechanical rather than hand-policed.
- **Foundation — backend base (stable contract).** Freeze the preserved engine + stores
  contract as the rewrite's API. Add only the bounded read-and-infer features the designs
  need: enrich the node-evidence projection to the shape the inspector/hover-card require
  (the engine already self-flags the divergence), and a bounded read-only
  historical/committed-range text-diff route (in scope per sign-off). Everything else the
  designs imply is already served.
- **Foundation — Code Connect linkage.** Wire the codebase to Figma through the CLI: a
  `figma.config.json`, `*.figma.tsx` mappings from code components to the Figma Kit
  primitives, validated by `figma connect parse`, with publish as the human's gated step.
  This links earnest frontend work to the binding design system component-by-component.
- **View rewrite — chrome.** Rebuild `frontend/src/app/` surfaces (rails, panels,
  overlays, settings, command palette) from their binding frames, each a dumb projection
  over the preserved stores hooks, using only foundation tokens and the sanctioned mark
  families. Surface divergences reconcile to the designs by construction.
- **View rewrite — headline canvas.** Rebuild `frontend/src/scene/` as a faithful
  translation of the binding `graph/*` frames: category-colored nodes sized by the
  engine-served salience, the node-connection field, the three states, and the
  consolidated plain-language controls, all driven through the preserved `SceneController`
  channel.
- **Supersessions.** This ADR amends the activity-rail tab IA, the node-visual-richness
  canvas-mark treatment, and the tier-edge color encoding to the binding designs, and flips
  the `themes-are-oklch` source-of-truth direction; the data behind the superseded visuals
  is retained.
  - *Amendment note (2026-06-16, Phase-5 review).* The right-rail tab IA ultimately
    landed as `Status | Inspect | Search | Changes` per the separately-accepted
    `2026-06-16-status-overview-adr` (refining the activity-rail decision this ADR
    superseded), not the `Inspect | Work | Search | Changes` set named above: the Work /
    in-flight-plan model is folded into the Status-overview surface rather than carried as
    its own tab. The persistent liveness header is retained. No Work data is orphaned; the
    divergence is purely between this plan's wording and the later ADR the code follows.

## Rationale

The research (F0–F5) shows the cheapest correct path is not to patch the view toward the
designs but to rewrite it against a preserved, already-strong backend and a settled
foundation. The layer-ownership boundary makes that safe: the state system and engine — the
expensive, correct parts — are untouched, and the view is the swappable projection the
architecture always intended. Adopting Figma as binding resolves the recurring drift the
research documents (manual, ungenerated foundations) by closing the pipeline gap once.
Sequencing the foundation (tokens + stable contract + Code Connect) ahead of the rewrite
means earnest frontend work proceeds against a stable, linked, design-bound base rather
than a moving target — directly the stated goal.

## Consequences

- **Gains:** a frontend that matches the binding designs by construction; a single
  generated foundation with mechanical parity; the precious state/engine layers preserved
  and proven; a live code↔design linkage that keeps future work honest.
- **Costs (honest):** the view rewrite is large, and the headline custom canvas is the
  dominant effort — a bespoke rendering translation, not a restyle. The token migration
  touches hundreds of usages. Several accepted ADRs/rules are superseded and must be
  amended, not silently overwritten.
- **Pitfalls:** drifting the preserved stores/`SceneController` contract during the rewrite
  would forfeit the safety the layer model provides; leaving the token pipeline gap open
  would let the same drift recur; Code Connect publish remaining plan-gated means the
  linkage is authored locally and published by a human, not automated.
- **Pathways opened:** with the foundation, contract, and linkage stable, the view rewrite
  can fan out surface-by-surface against a fixed API, and the headline canvas can be
  tackled as an isolated, high-effort wave without destabilizing the rest.

## Codification candidates

- **Rule slug:** `figma-is-the-binding-source-of-truth`.
  **Rule:** The Figma design file is the single binding source of truth for the dashboard's
  design system and surfaces; code is authored to match it (superseding the prior
  code-canonical token direction), and any deviation requires an explicit ADR.
- **Rule slug:** `view-rewrite-preserves-the-state-and-scene-contract`.
  **Rule:** A view-layer rewrite consumes the existing `frontend/src/stores/` hooks and the
  `SceneController` command/event contract unchanged — it adds no fetch, mints no model, and
  changes those contracts only through a reviewed contract event.
- (`figma-code-connect-via-cli` was already codified this cycle.)
