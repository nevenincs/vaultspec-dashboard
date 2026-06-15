---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S25'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---




# Rebuild the node-canvas scene to consume the new token layer via getComputedStyle and sanctioned domain marks per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green

## Scope

- `frontend/src/scene/field/nodeSprites.ts`

## Description

Completed the node-canvas recodification at the chrome/overlay seam. The renderer
side (`scene/field/*`) already consumed the new tokens and Phosphor domain marks;
this Step brought the DOM overlay, the node interior, and the browse interaction
onto the same token-and-mark foundation and realized every canvas wire state the
ADR names at the chrome layer.

Per-ADR React element inventory (chrome/overlay layer), each mapped to existing
JSX or NEW:

- Stage host (the focusable canvas surface) — EXISTING div in `Stage.tsx`,
  RECODIFIED: now `tabIndex=0`, `role=application`, an accessible label naming the
  keyboard contract, and a token focus ring.
- DOM island shell — EXISTING `Island` in `IslandLayer.tsx`, RECODIFIED: id header
  is monospace identity, close affordance swapped from the hand-drawn `×` glyph to
  the Lucide `X` chrome icon, token spacing/transition.
- Node interior — feature lifecycle axis — EXISTING `FeatureLifecycle` in
  `NodeInterior.tsx`, RECODIFIED: each axis entry now carries its `DocTypeMark`
  silhouette from the shared registry, token classes throughout.
- Node interior — plan tiered steps — EXISTING `PlanInterior`, RECODIFIED: progress
  counts are tabular numerals, done state carries a check/○ glyph + fill + border
  (grayscale-safe, `aria-pressed`), not hue alone.
- Node interior — node summary — EXISTING `NodeSummary`, RECODIFIED: doc-type and
  lifecycle `StateMark` from the registry, the node id rendered as monospace
  identity.
- Loading states (constellation / document / awaiting-scope) — NEW
  `CanvasStateOverlay` centered notices, replacing the inline ternary in `Stage.tsx`.
- Empty / no-graph invitation — NEW: replaces the inline hand-drawn `✎` block with a
  Lucide `Brain` mark and the approachable "no second brain yet" copy plus the
  install next-step in mono.
- Per-tier degradation (honestly-absent tier) — NEW corner banner: non-blocking
  annotation over the live field, names the absent tier (non-color cue).
- Truncated bounded query — NEW corner banner: "narrowed — refine your view" derived
  from the slice `truncated` block, counts in tabular numerals, Lucide `ScanSearch`.
- Unknown-tier data error — NEW corner banner: a degraded-tier name outside the four
  canonical tiers surfaces as a data error (Lucide `AlertTriangle`), never a silent
  re-bucket.
- Interior / detail fetch failure — EXISTING text in `NodeInterior`, RECODIFIED:
  contained "interior unavailable" on that island with a Lucide `FileWarning`
  non-color cue and `role=status`.
- Keyboard graph-walk + select/open/expand — NEW `graphWalk.ts` bound to the host:
  arrow/Tab walk the focused node across its ego edges, Enter opens, `e` expands,
  Escape clears — all instant shared-store writes (no animation).

Implementation:

- Added a pure `resolveCanvasState` resolver mapping stores-derived truth (scope,
  granularity, the degradation matrix stage cell, the held slice, and the pre-derived
  `useGraphSliceAvailability`) to one designed state; precedence mirrors the ADR
  "States" prose.
- Surfaced the wire `truncated` block: added the additive `truncated` field to the
  `GraphSlice` type (the live `vaultspec-api` `/graph/query` already serves it and it
  survives `adaptGraphSlice` untouched), and taught the mock engine to emit the live
  `{total_nodes, returned_nodes, reason}` shape behind a `setTruncated` toggle so the
  state is exercised through the real client path (mock mirrors the live wire).
- Wired keyboard operability through the shared selection (the scene-origin path, so a
  walk selects without bouncing the camera) and the existing `openNode` /
  `addToWorkingSet` view-store actions; layer ownership preserved — no fetch, no raw
  `tiers` read, projection over the one held slice.

Tests: pure resolver state-table tests, graph-walk ego/next-focus/key-table + a
bound-listener harness (instant, form-control guard, no-op-with-nothing-focused),
`stateMarkKey` resolution, an overlay render test per designed state, and a
`NodeInterior` render test through the mock for the contained interior-unavailable
state plus the lifecycle-axis and tiered-step grammar.

## Outcome

Done. The node-canvas recodification is complete end-to-end: the renderer consumes the
new tokens and domain marks, and the chrome/overlay seam (stage host, islands, node
interior, every canvas wire state, the browse interaction with keyboard operability and
a11y non-color cues) is now on the same token-and-mark foundation. Lint gate
(`just dev lint frontend`): eslint + prettier + tsc all green for the authored files;
tsc reports errors ONLY in a concurrent agent's in-flight `git.dirty: boolean` refactor
(`app/right/`, `stores/server/queries.ts`, `liveAdapters.ts`, the git-mapping
adversarial test), none in scope here. Authored tests: 36 pass; the full suite's 7
failures are all the same concurrent git-refactor files, none mine.

## Notes

- Per the task fence, did NOT touch `stores/server/queries.ts`, `app/right/`,
  `app/timeline/`, the sibling `app/stage/` control files, `scene/field/marks*` /
  `domainGlyphs*`, or `styles.css`. New files (`CanvasStateOverlay.tsx`,
  `graphWalk.ts`, and their tests) were authored in `app/stage/`; committed by
  pathspec only.
- ADR / seam insufficiency to flag for refinement: the ADR mandates keyboard-initiated
  CAMERA actions be INSTANT (not animated), but the locked `SceneController`
  `focus-node` command always routes through `camera.animateTo`, and `animateTo` is not
  `prefers-reduced-motion`-gated (only the field's visibility fade band is). An instant
  focus path is a seam concern (a new command or a flag on `focus-node`) — an
  ADR-flagged redline on the locked union, out of scope for this chrome Step. The
  keyboard SELECTION this Step adds is instant shared-store state; only the camera
  follow still animates. Recommend a seam redline to add an instant/reduced-motion
  focus variant.
- The wire `truncated` block was already served live but untyped and unconsumed on the
  client; typing it on `GraphSlice` (engine.ts, additive) plus the mock toggle is the
  minimal surfacing needed for the truncated chrome state. No `queries.ts` change was
  required — `adaptGraphSlice` already spreads it through.
- Code review (safety + intent) surfaced one required revision: the keyboard graph-walk
  trapped Tab (WCAG 2.1.2 no-keyboard-trap) because `nextFocus` always seeded a node, so
  Tab-from-unfocused was swallowed with no escape. Revised: a `walk` action now carries a
  `via` discriminator; Tab steps the ego ring only when a selection is present and
  advances, and bubbles uninterrupted when there is nothing to walk from, so focus can
  always leave the canvas widget. Arrow keys remain free to seed/walk (they are not
  focus-traversal keys), and Escape clears. Revision landed and tested before close.

Independent review returned PASS-WITH-REVISIONS (2 HIGHs); both fixed in a follow-up
revision commit (the resolver precedence, overlay states, no-keyboard-trap fix, layer
ownership, instrument grammar, and marks were all confirmed and left untouched):

- HIGH-1 (mock-vs-live fidelity): the `truncated` field was unit-tested only on
  hand-built slices, never proven through the real client path. Added a consumer test
  that calls `MockEngine.setTruncated(n)`, drives `engineClient.graphQuery` through the
  real transport, asserts the returned `GraphSlice.truncated` shape survived
  `adaptGraphSlice`, then that `resolveCanvasState` over that adapter-produced slice
  yields the truncated state — and the unbounded-feature path serves no block and
  resolves ok. The `mock-mirrors-live-wire-shape` proof. No mock/engine edit needed; the
  already-committed `setTruncated` toggle and `truncated` type carry it.
- HIGH-2 (camera motion-law): closed the prior seam insufficiency with ONE additive
  seam amendment, strictly within the locked-seam discipline — an optional
  `animate?: boolean` field on the existing `focus-node` command (default undefined ≡
  true preserves existing behaviour; NO new command, NO new semantics). `camera.animateTo`
  now takes an optional `{ instant }` and SNAPS instantly when `instant` is set OR
  `prefers-reduced-motion` is active (the camera reads reduced-motion via an injectable
  predicate, default `matchMedia`, so both branches are testable). This also closes the
  pre-existing reduced-motion violation on the cross-region focus path (search-hit /
  timeline-event / browser-row selection previously animated the camera ignoring reduced
  motion). The keyboard walk now issues `focus-node {animate:false}` through a new
  `focusFromWalk` helper that selects (scene-origin, no double-follow) and instantly
  re-centers, fixing the off-screen operability gap (a walked node could leave the
  viewport with no follow) while keeping keyboard actions instant. Seam confirmed
  additive: all existing `focus-node` and `animateTo` callers omit the new optional
  fields and are unaffected. Tests assert instant/reduced-motion snap and the
  walk-re-centers command.
