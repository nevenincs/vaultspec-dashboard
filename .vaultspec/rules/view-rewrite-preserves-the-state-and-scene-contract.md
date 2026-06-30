---
name: view-rewrite-preserves-the-state-and-scene-contract
---

# A view rewrite preserves the state and scene contract

## Rule

A view-layer rewrite consumes the existing `frontend/src/stores/` hooks and the
`SceneController` command/event contract UNCHANGED. The rewritten view (`frontend/src/app/`
chrome, `frontend/src/scene/` canvas) adds no new `fetch` against the engine, mints no new
client model or node shape, never reads the raw `tiers` block directly, and changes the
stores shapes or the `SceneController` surface only through a deliberate, reviewed contract
event — never as an incidental part of restyling. The state system and the engine are
preserved as the rewrite's frozen API; only the projection over them is replaced.

## Why

The `2026-06-16-figma-parity-reconciliation-adr` rebuilds the entire view layer against the
binding Figma designs while declaring the TanStack state system (query cache, SSE delta
clock, view stores, wire client) and the whole engine precious and untouched. The four-layer
ownership boundary (`dashboard-layer-ownership`) is exactly what makes that safe: the view is
a pure projection over the stores model and the scene receives data only through
`SceneController` commands, so the face can be replaced without touching the nervous system
or the backbone. The pitfall the ADR names explicitly: drifting the preserved
stores/`SceneController` contract during the rewrite would forfeit that safety — a rewrite
that quietly adds a fetch, invents a node shape, or reads `tiers` raw re-scatters wire access
across the view and recreates the `mock-mirrors-live-wire-shape` drift the single-consumer
boundary exists to prevent. Freezing the contract as the rewrite's API keeps a large view
rebuild from becoming a stealth rewrite of the state layer too.

## How

- **Good:** a rewritten surface subscribes to an existing stores query hook and emits intent
  (select, hover, expand) back; the headline canvas renders only data delivered through
  `SceneController.command()` and reports selection/hover through its event channel.
- **Good:** the rewrite genuinely needs a new wire datum (e.g. the enriched node-evidence
  shape) — it lands as a reviewed change to the engine projection and the stores layer FIRST,
  then the view consumes it; the contract change is a deliberate, reviewed event.
- **Bad:** a rewritten component calling `fetch` against the engine, defining its own node
  type, reading the raw `tiers` block, or mutating a stores shape inline "to make the new UI
  work" — that crosses the layer boundary and forfeits the safety the rewrite depends on.

## Status

Active. Promoted from the `figma-parity-reconciliation` ADR codification candidate at the
close of the reconciliation cycle, in which `frontend/src/app/` and `frontend/src/scene/`
were rebuilt to the binding designs over the unchanged stores and `SceneController`
contracts. Sibling of `dashboard-layer-ownership` (the one-way boundaries this builds on),
`views-are-projections-of-one-model`, `mock-mirrors-live-wire-shape`, and
`figma-is-the-binding-source-of-truth` (the authority direction the rewrite follows).

## Source

ADR `2026-06-16-figma-parity-reconciliation-adr` (accepted; codification candidate) and
research `2026-06-16-figma-parity-reconciliation-research` (the preserved-contract boundary,
F2/F3). Sibling rules `dashboard-layer-ownership`, `views-are-projections-of-one-model`,
`mock-mirrors-live-wire-shape`, `figma-is-the-binding-source-of-truth`.
