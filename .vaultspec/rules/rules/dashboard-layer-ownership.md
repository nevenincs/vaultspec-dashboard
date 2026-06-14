---
name: dashboard-layer-ownership
---

# Dashboard layer ownership: four slices, one-way data boundaries

## Rule

The dashboard is owned as four layers with one-way data boundaries that no layer may
cross: the `vaultspec` engine (`engine/`) serves the wire and is read-and-infer;
`frontend/src/stores/` is the *sole* client of that wire — the only place that fetches,
holds the query cache and the SSE delta clock, and reads the per-tier `tiers` block;
`frontend/src/scene/` renders the model and receives data only through
`SceneController` commands, emitting selection and hover back via its event channel;
`frontend/src/app/` is the leaf chrome that renders store and scene state and computes
no derived data. Scene and chrome never speak to the engine directly, and chrome never
`fetch`es — it reads `tiers` only through the stores' hooks.

## Why

The four-layer split with these boundaries is what keeps the engine a swappable backbone
and the GUI honest; it held across the full foundation and GUI build cycle
(`2026-06-12-dashboard-foundation`, `2026-06-12-dashboard-gui`). The client-side
conformance work and the HIGH state-corruption findings (022 cross-scope reset, 023 pin
re-keying, 018 lens scope) all lived in `frontend/src/stores/` precisely because that is
the one layer that touches the wire — diffusing engine access into scene or chrome would
scatter those same failures across every surface with no single home. Existing rules
already fence facets of this map (`engine-read-and-infer`,
`every-wire-response-carries-the-tiers-block`); this rule names the whole ownership
boundary so a new agent inherits where each concern lives.

## How

- **Good:** a new UI surface in `frontend/src/app/` needs graph data — it consumes a
  stores query hook; the stores layer owns the fetch, the cache, and the `tiers` truth.
- **Good:** the scene needs a new delta — the stores feed it through
  `SceneController.command()`; the scene renders it, and the chrome never learns the wire
  shape.
- **Bad:** a component in `frontend/src/app/` or `frontend/src/scene/` calling `fetch`
  against the engine, or reading the raw `tiers` block — that re-creates the
  scattered-access failure the single-consumer boundary exists to prevent; route it
  through `frontend/src/stores/`.

## Status

Active. The ownership map for the four-team build: Engine+CLI (backbone), Data & State
(`frontend/src/stores/`, nervous system), Scene/GPU (`frontend/src/scene/`, face), App
Chrome (`frontend/src/app/`, glass). Consolidates boundaries already enforced per-layer
by `engine-read-and-infer` and `every-wire-response-carries-the-tiers-block`.

## Source

Foundation and GUI cycle audits `2026-06-12-dashboard-foundation-audit` and
`2026-06-12-dashboard-gui-audit` (state-corruption findings 018/022/023, the S49
client-conformance divergences). Contract reference
`2026-06-12-dashboard-foundation-reference`. Sibling rules `engine-read-and-infer`,
`every-wire-response-carries-the-tiers-block`.