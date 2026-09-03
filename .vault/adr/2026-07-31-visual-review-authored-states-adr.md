---
tags:
  - "#adr"
  - "#visual-review"
date: '2026-07-31'
related:
  - "[[2026-06-14-dashboard-design-adoption-adr]]"
  - '[[2026-07-30-visual-review-harness-research]]'
  - '[[2026-07-31-visual-review-harness-audit]]'
supersedes:
  - '2026-07-30-visual-review-harness-adr'
modified: '2026-09-03'
body_schema: 'body-v1'
body_hash: 'sha256:0fe0e91ccf53da82c2ee239e771281263e69929ecf84800f6363b3b11b064311'
---
# `visual-review` adr: `authored per-component review states` | (**status:** `accepted`)

## Problem Statement

The component state review surface must show every principal dashboard component in four states (normal, loading, empty, degraded) in both themes, from one URL, with no dependency on a running engine, socket, or network. The prior desk mounted each component in an iframe against a live demo engine with backend-served conditions; roughly a third of its cells rendered blank or failed to mount, most cells looked identical across conditions, and the whole desk could go blank whenever the demo engine was slow, absent, or holding the browser's per-origin connection pool. The desk existed to review rendering and could not reliably render.

## Considerations

- The `production-dev-separation` rule fences dev harnesses: "modes are rendered, never simulated", and the previous component gallery was removed precisely for keeping a seeded engine wire outside test confidence.
- Purely presentational views cannot be driven into distinct states by any backend: they receive resolved props, so a wire-backed desk shows them identical in all four cells — the state axis is unreviewable by construction.
- A review desk's availability requirement is stricter than its evidential requirement: it must always render, while proof that the application genuinely REACHES a state over the wire already belongs to the online test suites (`wire-contract`: tests exercise the live wire).
- The browser connection pool made the iframe-per-cell architecture structurally fragile: `loading` cells hold requests open by design, starving sibling cells of sockets.

## Considered options

- Backend-served conditions over a demo engine (the prior desk): highest evidential value, but unavailable whenever the engine is, blind to presentational views, and connection-pool-fragile. Rejected on the record of its own survey tooling.
- Seeded engine-wire double (a faked `fetch` serving authored envelopes): renders everything, but reviews the harness's imitation of the wire and repeats the exact mistake that got the previous gallery removed. Rejected.
- Authored per-component inputs (chosen): each cell renders the real production component; a wire-free view receives authored props typed against the app's own view-model types; a container receives a per-cell TanStack QueryClient seeded at its real `engineKeys` with authored typed payloads; the page's `fetch`/`EventSource` are hermetically inert, so an unseeded query pends forever — which IS the app's real pending path for the loading cell.

## Constraints

- This is a KNOWING departure from the `production-dev-separation` fence's "modes are rendered, never simulated" clause, made as an explicit owner decision for this one dev-only surface. The fence's mechanical guarantees stay intact: everything lives under `frontend/dev/`, imports flow one-way into `frontend/src/`, no production component gains a harness affordance, and no test consumes the authored inputs.
- Authored payloads are typed against the application's own store/wire types, so wire-shape drift is a compile error, not a silently stale review.
- The scene-owning composites (`Stage`, `DockWorkspace`, `AppShell`) cannot be prop-driven: the WebGL canvas is an app-lifetime, portal-pinned singleton, so four simultaneous cells are structurally impossible. They are listed on the desk with the exclusion stated; their visual states are the composition of surfaces the desk reviews individually (`CanvasStateOverlay` carries the canvas's four states).

## Implementation

One desk at `/visual-review/` on the dev-domain Vite server (port 8777, Tailscale-reachable). `surfaces.ts` extracts the data-bearing component inventory from the module graph; `specimens/` holds one authored entry per surface (props, query seeds, or a stated exclusion), joined against the inventory so a gap is visible on the desk rather than silently absent. `hermetic.ts` inertizes the page's network before any production module loads. Theme is a root-level axis (light, dark, high-contrast), matching how the application's own theme controller applies `data-theme` — a per-subtree remap is impossible because the public color tier flattens its variable references at `:root`. The demo-engine estate (serve wrapper spawning engines, demo corpora, condition proxy, survey and adjudication scripts) is deleted; `just review` starts Vite alone.

## Rationale

Authored inputs are the only option that satisfies all three hard requirements at once — every component reaches all four states (including presentational views no backend can drive), the desk cannot be blanked by backend conditions, and the rendered thing is the real production component. The evidential loss relative to backend-served conditions is real and accepted: a desk cell proves what a state looks like, never that the application reaches it; reachability remains the province of the live-wire test suites, which this decision leaves untouched.

## Consequences

- Every principal surface is reviewable in all four states and all three themes, always, from one URL, with no engine running.
- The authored inputs are a maintenance surface: a renamed query key or reshaped payload surfaces as a compile error or a visibly wrong cell, and the specimen must be updated alongside the component.
- A green desk cell must never be cited as evidence that a wire path works; reviewers are told so on the desk and in the dev README.
- The `production-dev-separation` rule text still states the unqualified fence; this record is the sanctioned exception for `frontend/dev/visual-review/` only, and any second surface wanting authored state data must argue its own case rather than cite this one.
