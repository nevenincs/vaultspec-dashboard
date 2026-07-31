# The dev domain

Everything under `frontend/dev/` is development scaffolding. **None of it ships.**

The production build input is exactly `index.html` (see `vite.config.ts`), and this tree is
served only by `vite.dev.config.ts`, which roots here. The two configs are separate for the
same reason the two trees are: the fence is structural, not conventional.

## The one-way import law

```
dev/**  ──may import──▶  src/**        ✅  the harness renders REAL components
src/**  ──may import──▶  dev/**        ❌  build failure
```

Production code must never reach into this tree, and must never carry an affordance that
exists only to serve it — no preview props, no dev-only override branches. Both directions
are enforced by `dev/tooling/scan-domains.mjs`, wired into `just lint frontend`.

Dev-domain modules reach production code through the `@app` alias.

## Why the fence exists

A component gallery was built here once and removed, because it depended on a seeded engine
wire to render populated chrome — an authored double outside the test gates, in conflict
with the rule that the frontend never fakes the engine wire. Alongside that, the preview
concern had leaked into production in four places: a dev-only prop on a shipped component,
a dev module inside the production stores layer, dev copy compiled into the shipped
localization catalog, and five harnesses under `src/` each inventing its own way to preview
a state.

Keeping this tree fenced is what stops that from recurring. It also keeps the `lint:px` and
`lint:localization` gates meaningful — both sit at zero findings, and harness chrome
authored under `src/` would breach the latter.

## Contents

- `visual-review/` — the component state review desk (below).
- `labs/` — focused single-surface harnesses, each pinned to one surface.
- `spike/` — throwaway experiments.

## Visual review desk

`just review` (or `npm run dev:visual-review`) → `http://localhost:8777/visual-review/`

Every principal UI surface, rendered across the four review states — **normal /
loading / empty / degraded** — under the light, dark, and high-contrast themes. Pick a
component in the left nav; the four states render side by side; the theme control
re-themes the whole desk.

### Untethered by design

Each cell mounts the REAL production component (imported from `src/app/`); only its
INPUTS are authored. The page starts no engine, opens no socket, and issues no fetch —
`visual-review/hermetic.ts` makes the page's `fetch`/`EventSource` inert — so the desk
cannot go blank, or silently flip a cell's state, because a backend is slow, absent, or
holding connections.

State reaches a component one of three ways (`visual-review/specimens/AUTHORING.md`):

- a wire-free view gets authored PROPS, typed against the app's own view-model types;
- a container gets a per-cell QueryClient SEEDED at its real `engineKeys` with authored
  payloads (loading = the unseeded query pending against the inert fetch — the app's
  real pending path);
- the scene-owning composites (`Stage`, `DockWorkspace`, `AppShell`) are excluded with
  the reason stated on the desk: the WebGL canvas is an app-lifetime portal-pinned
  singleton, and their states are the composition of surfaces the desk already reviews.

Authored inputs are a KNOWING, owner-approved departure from the
"modes are rendered, never simulated" fence — recorded in the ADR
`2026-07-31-visual-review-authored-states-adr`. The trade is explicit: a desk cell
proves what a state LOOKS like; only the live app (and the online test suites) prove a
state is genuinely REACHED over the wire.

### Surfaces are extracted, not enrolled

`visual-review/surfaces.ts` walks the module graph and keeps the DATA-BEARING
components — the ones composing `StateBlock`/`Skeleton` or reading stores, which is
exactly what it means to have a loading/degraded/empty state at all. Atoms are
excluded: a Button has no empty state. A new panel appears in the desk (flagged
"without authored states") the moment it is written; its specimen is then authored in
`visual-review/specimens/`.
