---
tags:
  - "#audit"
  - "#editor-dock-workspace"
date: '2026-06-18'
related:
  - "[[2026-06-18-editor-dock-workspace-plan]]"
  - "[[2026-06-18-editor-dock-workspace-adr]]"
promoted_to:
  - 'rule:graph-canvas-is-portal-pinned-never-reparented'
modified: '2026-07-12'
---

# `editor-dock-workspace` audit: `dockable tabbed editor workspace review`

## Scope

Formal code review (Verify phase) of the `editor-dock-workspace` feature: the
dockview-based, session-persisted split workspace replacing the single-document
viewer overlay — graph-right / documents-left, walkable / tabbable / movable /
hot-dockable, with a portal-pinned Pixi canvas that survives docking, VS Code
provisional/permanent tabs, full Markdown read+edit (code read-only), over the
preserved stores and `SceneController` contracts. Sixteen feature commits were
reviewed against the project rules (`dashboard-layer-ownership`,
`bounded-by-default-for-every-accumulator`,
`themes-are-oklch-generated-from-a-token-tier`,
`view-rewrite-preserves-the-state-and-scene-contract`,
`design-system-is-centralized`). Unrelated concurrent work in the shared tree was
excluded. Verdict: REVISE; the required revision and two of three recommended
revisions have since landed.

## Findings

### Verified clean (load-bearing)

- **The portal-pinned canvas contract holds BY CONSTRUCTION.** The dock host
  renders the canvas host (which mounts the unchanged `Stage`, the real Pixi
  canvas) as a SIBLING of the `DockviewReact` container inside one positioned
  root; the dockview graph panel is only an empty rect-publishing placeholder.
  dockview can move / split / float / re-dock the placeholder but can never reach
  the canvas DOM node, so the WebGL context and the `SceneController` seam survive
  every dock. The rect-tracking settle loop and the drag-time `pointer-events:none`
  toggle are correct. This is the feature's central guarantee and it is sound.
- **No store↔dockview feedback loop.** The `syncingRef` guard suppresses
  dockview's synchronously-fired echo events during programmatic mutation; the tab
  reorder short-circuits to the same reference when order is unchanged. Nothing in
  the feature contributes to the unrelated concurrent render-loop seen in the
  shared tree.
- **Bounded-by-default.** The open-tab collection is capped with LRU eviction
  (preserving active/provisional); persistence is coalesced (debounced); content
  observers are bounded; the engine's per-scope state slot is LRU-bounded.
- **Layer ownership.** No feature `app/` file fetches, imports the engine client,
  or reads raw `tiers`; all wire access flows through stores hooks; the
  `SceneController` seam is untouched.
- **VS Code tab semantics, the editor write path, the full S09 no-bridges cutover,
  and engine read-and-infer** were each verified correct.

### HIGH-1 — persisted tab set was missed on cold load (restore-timing race). FIXED.

The restore effect marked a scope restored on the first render, BEFORE the async
dashboard-state query resolved — at which point the panel-state blob is the
fallback (no layout), so the parse returned null and the late-arriving blob was
never restored. This silently defeated the persistence on essentially every reload.
Fixed by gating the restore on the query's SETTLED signal
(`useDashboardState(scope).isSuccess`) so the real blob is restored once it arrives,
still only when the tab slice is empty (never clobbering user-opened tabs).

### MED-1 — `workspace_layout` blob had no field-level size bound. FIXED.

The opaque layout blob was retained per scope with only the incidental 1 MiB
request-body limit as a cap, contrary to bounding-at-creation. Fixed with a
`MAX_WORKSPACE_LAYOUT_LEN` (64 KiB) check in the panel-state validator returning a
tiered 400, mirroring the existing `right_tab` / `selected_ids` caps.

### MED-3 — dockview floating shadow was a raw literal, not a token. FIXED.

`--dv-floating-box-shadow` was a hard `rgb()` literal that would not flip across
the three themes. Rebound to the shared `--shadow-fg-overlay` elevation token.

### MED-2 — unsaved editor draft silently discarded when editing a second document. DEFERRED.

The single editor slice has no dirty-guard when `enterEdit` is invoked on a second
document, so an unsaved draft on the first can be silently overwritten (narrow
window: requires an explicit Edit on a different doc). A correct fix routes a
"another document has unsaved changes" guard through the stores editor view hook
(`useDocumentEditorView`) to stay layer-clean; that surface is under concurrent
refactor, so the fix is deferred to coordinate rather than race it with a raw
store read.

## Recommendations

- Land MED-2 once the editor view-hook refactor settles: add a discard-confirm (or
  block) guard in the edit-enter path, surfaced through the stores editor view.
- Add an effect-level test for the HIGH-1 restore timing (a deferred-blob
  `renderHook` case) when the concurrent stores-hook churn settles enough to make
  such a test non-brittle; the pure serialize/parse round-trip is already covered.
- Complete the environment-gated verification when the shared tree stabilizes: the
  full lint gate (blocked only by concurrent unformatted files), the full vitest
  run, the live interactive canvas-survival pass, persistence-across-reload on a
  rebuilt engine, and the live edit/save round-trip against a fixture vault.

## Codification candidates

- **Source:** the verified-clean portal-pinned canvas finding.
  **Rule slug:** `graph-canvas-is-portal-pinned-never-reparented`.
  **Rule:** The Pixi graph `<canvas>` is mounted once in a stable app-lifetime
  container rendered as a sibling of (never inside) the dock manager, and is
  positioned to track its panel's rect; no layout/dock/view change may re-parent
  it, because re-parenting a canvas destroys its WebGL context and the
  `SceneController` seam. (Already named as a candidate in the ADR; this review is
  one cycle of evidence toward promotion — promote after it holds across a full
  cycle per the codify discipline.)
