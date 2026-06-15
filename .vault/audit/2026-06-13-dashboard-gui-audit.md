---
tags:
  - '#audit'
  - '#dashboard-gui'
date: '2026-06-13'
modified: '2026-06-15'
related:
  - '[[2026-06-13-dashboard-gui-plan]]'
  - '[[2026-06-13-dashboard-platform-plan]]'
  - '[[2026-06-12-dashboard-foundation-reference]]'
  - '[[2026-06-12-dashboard-gui-adr]]'
  - '[[2026-06-13-dashboard-platform-adr]]'
---

# `dashboard-gui` audit: `fe-reviewer pass: prototype chrome #6 and platform #7`

## Scope

Independent review of two completed prototype tasks:

- **Task #6 (fe-chrome):** graph workspace chrome — `FilterSidebar`, `NavToolbar`
  (camera SceneCommands + semantic level label), `AlgorithmPanel` (force↔circular
  + FA2 param sliders via `set-layout-params`/`set-layout-mode`), `MinimapWidget`
  (`setMinimapCanvas`).
- **Task #7 (fe-platform):** `ChangesOverview` right-rail tab consuming
  `useEngineEvents`, plus `WorktreePicker` resilience (error-state retry button,
  8 s poll recovery). Committed at `e65756f`.

Gates verified independently: `just dev lint all`, `just dev test all`, adversarial
suite checked by name and test count. Review rubric: (1) spec/ADR conformance,
(2) layer-boundary integrity, (3) adversarial suite + gates green, (4) visual/UX
quality.

## Findings

### Task #6 — WITHHOLD

#### F6-01 · CRITICAL · Deliverable files not committed to git

All four task #6 components (`FilterSidebar.tsx`, `NavToolbar.tsx`,
`AlgorithmPanel.tsx`, `MinimapWidget.tsx`) are `??` untracked in git — they exist
in the working directory but have no commit. The executor's "348/348, tsc/eslint
clean" claim cannot be verified against a committed state. No commit SHA was
provided for task #6. Review-revision-precedence cannot close until work is
committed: untracked files are not reviewable progress.

**Required:** Commit all four files. Provide the commit SHA for re-check.

#### F6-02 · HIGH · No unit tests for any task #6 component

The `vaultspec-system` mandate requires "focused tests" after adding features.
No test file exists for `FilterSidebar`, `NavToolbar`, `AlgorithmPanel`, or
`MinimapWidget`. The components expose pure logic suitable for isolated testing:
`LEVEL_LABEL` mapping in `NavToolbar`, facet-toggle logic in `FilterSidebar`,
`DEFAULTS` and FA2 param composition in `AlgorithmPanel`. A mounted render
test for `MinimapWidget` verifying `setMinimapCanvas` call contract is also
missing.

**Required:** Add focused unit tests covering at minimum the pure helper surfaces
and the `setMinimapCanvas` mount/unmount contract.

#### F6-03 · MEDIUM · Frontend lint gate fails (working-tree noise, task #5)

`just dev lint all` (and `just dev lint frontend`) fail with 3 ESLint errors in
`frontend/src/stores/server/graphSync.ts` — unused imports (`useRef`, `useState`,
`GraphDeltaEntry`) introduced by fe-live-graph's in-flight task #5 modifications.
The failure is attributable to task #5's uncommitted edits to `graphSync.ts`
(`git diff HEAD` confirms the imports appear only in the working tree, not in
HEAD). The lint gate is shared: it must be green before any task in the working
tree can pass review. This is a coordination finding, not a task #6 defect, but
it blocks the gate.

**Required (coordination):** fe-live-graph must fix the unused imports in
`graphSync.ts` before the shared lint gate can pass. Task #6 re-check is gated
on a green `just dev lint all`.

#### F6-04 · MEDIUM · Visual/UX — glyph-based icon controls are placeholder quality

`NavToolbar` uses Unicode glyphs (`−`, `+`, `⊡`, `↺`, `⚙`, `⛶`) for camera and
panel controls. These are functional but fall short of the "modern/fluid/
cutting-edge" bar and the commissioned glyph family the ADR mandates
(GUI ADR §7.2, G7.c). The `AlgorithmPanel` and `FilterSidebar` chrome are clean
and well-structured; the toolbar is the weakest surface. The visual language
charter states the glyph family (SVG + GPU forms) is dedicated design work — the
path is to swap in the commissioned family behind the same `ToolButton` interface
once it lands, which is acceptable. The current state is acceptable as placeholder
if a clear upgrade path is documented.

**Non-blocking** (task #8 scope): the visual quality lift is active (task #8);
this finding is informational for that executor.

#### F6-PASS · Layer-boundary integrity

All four components are clean:
- `FilterSidebar`: reads `useFilterStore`, `useFiltersVocabulary`, `useViewStore`
  (stores hooks only; no fetch, no wire access).
- `NavToolbar`: calls `SceneController.command()` and subscribes to
  `controller.on()`; never reads stores, never fetches. Seam boundary honored.
- `AlgorithmPanel`: calls `SceneController.command()` and reads
  `controller.getLayoutState()`; never imports from `stores/` or `app/`.
- `MinimapWidget`: calls `setMinimapCanvas()` on mount/unmount; chrome provides
  the canvas target, scene owns the pixels. Boundary correct.

No upward imports into `platform/`; no scene or chrome `fetch` calls.

---

### Task #7 — PASS with MEDIUM revision required

#### F7-01 · MEDIUM · No tests for `ChangesOverview` pure helpers

`eventGlyph`, `eventLabel`, `relativeTs`, `basename`, and `isVaultPath` are all
exported pure functions (the working-tree version; the committed version exports
`eventGlyph`, `eventLabel`, `relativeTs`). These are the pattern the test suite
has consistently covered for analogous surfaces (cf. `NowStrip.test.tsx`,
`rail.test.ts`). No `ChangesOverview.test.ts` exists. The mandate requires
focused tests; these helpers are trivially isolated.

**Required revision:** Add `ChangesOverview.test.ts` covering the exported pure
helpers. Can land as a follow-up commit before the next forward phase.

#### F7-02 · LOW · Uncommitted working-tree additions to `ChangesOverview.tsx`

The working tree `ChangesOverview.tsx` is significantly richer than the committed
`e65756f` version: it adds `useEngineStatus()` for git status header, a
`DirtyFiles` section, expand/collapse event rows with `truncated_node_ids`
display, and `basename`/`isVaultPath` helpers. A `// TODO(fe-platform)` comment
in the uncommitted portion suggests this is continued task #7 work or task #8
enhancement. These additions are not committed and therefore unreviewed. They
must be committed and submitted for review before they are considered delivered.

**Non-blocking for this verdict** (additions are additive; committed base is clean).
The executor should commit the full `ChangesOverview.tsx` if these are task #7
completions, or the task #8 executor should commit them under task #8.

#### F7-PASS · Layer-boundary integrity (committed state)

The committed `ChangesOverview.tsx` reads `useEngineEvents(scope)` and
`useViewStore` (stores hooks, no fetch); `useActiveScope()` from Stage (correct
pattern). Clicking routes through `selectEntity` (view store, G2.b selection
concept honored). `WorktreePicker` updates add `refetchInterval` on error state
(8 s poll recovery, correct resilience pattern). `WorktreePicker.test.ts` covers
`orderWorktrees` and the 022/scope-switching wholesale-reset contract. No
cross-boundary violations.

#### F7-PASS · Spec/ADR conformance (committed state)

- `useEngineEvents(scope)` key folds scope correctly; stateless scope per
  contract §3. Disabled when `scope === null` (correct).
- `selectEntity` routing through view store (G2.b shared selection concept).
- `WorktreePicker` error recovery: retry button + `refetchInterval` on error
  matches the "degradation is a feature" thesis (GUI ADR §8).
- `WorktreePicker.test.ts` scope-switching test (finding 022 regression guard)
  present and passing.

---

### Gates (all tasks)

- **Tests:** 352/74 pass. Adversarial suite (8 files) present on disk and
  included in passing total. Gate: GREEN.
- **Frontend lint:** 3 ESLint errors in `graphSync.ts` — attributable to
  fe-live-graph's in-flight task #5 edits (confirmed by `git diff HEAD`).
  Gate: RED (coordination issue; not task #6 or #7 authored code).
- **Rust/engine lint:** formatting-diff errors in `engine/crates/vaultspec-api/`
  — attributable to fe-live-graph's in-flight task #5 engine work.
  Gate: RED (coordination issue).
- **Adversarial suite integrity:** The stale git-status snapshot at session start
  showed 8 adversarial test files as ` D` (deleted from working tree); current
  filesystem confirms all 8 are present and passing. No weakening or deletion
  of adversarial tests is present in the current state. Gate: GREEN.

## Recommendations

1. **fe-chrome (task #6):** Commit the four untracked files; add unit tests for
   pure helper logic and `setMinimapCanvas` contract; provide the commit SHA for
   re-check. Task #6 is withheld until F6-01 and F6-02 are resolved.
2. **fe-platform (task #7):** Add `ChangesOverview.test.ts` covering exported
   pure helpers (F7-01). Clarify and commit the uncommitted `ChangesOverview.tsx`
   working-tree additions (F7-02).
3. **fe-live-graph (task #5):** Fix the 3 unused imports in `graphSync.ts`
   (F6-03 coordination) so the shared lint gate returns to green.
4. **All:** Do not begin forward work past a withheld boundary (review-revision-
   precedence rule). Task #6 is withheld; task #6 executor's forward work is
   blocked until the revision re-check passes.

## Codification candidates

No new durable cross-session lessons surface from this review cycle. The
"untracked files are not reviewable progress" principle is operational discipline
already implied by the existing `review-revision-precedence` rule; it does not
need a separate rule. No candidates promoted.

---

## Addendum — 2026-06-13 · P03 re-check + task #6 re-check

### Task #6 re-check (fe-chrome, commit `fcc60ab`)

Prior withhold reasons F6-01 and F6-02 are resolved:
- **F6-01 RESOLVED:** All four files committed in `fcc60ab`.
- **F6-02 RESOLVED:** Tests added in the same commit — `AlgorithmPanel.test.ts`,
  `FilterSidebar.test.ts`, `NavToolbar.test.ts`, `MinimapWidget.test.ts`. Scoped
  correctly (LEVEL_LABEL, DEFAULTS, applyParams merge, seam contract, facet
  toggle/reset). Quality is adequate.
- **F6-03 COORDINATION RESOLVED:** The graphSync.ts ESLint noise (unused imports)
  is gone — the file is now properly committed by fe-live-graph (d8ee435).

**New finding — F6-03' MEDIUM: Prettier gate fails on committed task #6 files.**

`just dev lint frontend` runs `format:check`; it fails on `AlgorithmPanel.tsx`,
`FilterSidebar.tsx`, `MinimapWidget.tsx`, `MinimapWidget.test.ts`, `NavToolbar.tsx`,
`NavToolbar.test.ts` — all six authored in `fcc60ab`. ESLint is clean. The lint gate
as defined by the justfile is still RED.

**Verdict: STILL WITHHELD.** Fix Prettier on the six task #6 files, reconfirm
`just dev lint frontend` green, provide commit SHA.

Layer boundaries: PASS (code is correct — pure coordination/formatting block).
Tests: PASS (added in fcc60ab, quality adequate).

---

### P03 (fe-live-graph, commits `d8ee435` + `4b56403` + `c7d3aa1`)

Gates verified independently: `just dev test frontend` → 439/80 GREEN; ESLint
clean; Prettier (format:check) → RED on 9 files; Rust lint RED (temporal.rs,
commit `42b0e48`, separate author).

#### FP3-01 · HIGH · `Camera.animateTo()` and `EdgeMeshLayer.updateEdge()` have no tests

`animateTo()` (S08) is the most complex new public method: damped RAF lerp with
three-component stop thresholds, an `onDone` callback, and the invariant that any
gesture (`panBy`/`zoomAt`/`set`) cancels an in-progress animation. None of this is
covered — `camera.test.ts` tests the pre-existing pure math (`clampScale`, `zoomAt`,
`semanticLevel`, `SpatialHitTester`, `PointerGestures`) but has no `Camera` class
tests at all, let alone `animateTo`. The `cancelAnimation` contract (gesture wins
over programmatic) is a seam invariant; its absence from the test suite leaves the
most failure-prone path unguarded.

`updateEdge()` (S09) is the O(1) fast-path whose correctness depends on the
same-group-key comparison (`edgeGroupKey().split("+")[0]`) and in-place patch
semantics. Both are testable without GPU by constructing an `EdgeMeshLayer` with a
mocked PixiJS container (or using the existing headless test pattern in
`edgeMeshes.test.ts`). Add/remove fall-through and the group-shift fall-through are
the discriminating cases.

**Required:** Add focused tests for `Camera.animateTo` (stop-threshold,
gesture-cancels-animation, `onDone` fires) and `EdgeMeshLayer.updateEdge` (fast-path
pass, group-shift fall-through, unknown-id fall-through).

#### FP3-02 · MEDIUM · Prettier (format:check) gate fails — S10 "lint 0 warnings" claim is false

`just dev lint frontend` includes `format:check`; it fails on `sceneMapping.test.ts`
and `graphSync.test.tsx` (P03's own test files) plus `sceneController.ts` (unclear
attribution, pre-existing or P03). S10's commit message says "lint 0 warnings" — that
is contradicted by the gate. ESLint is genuinely clean; only Prettier fails.

**Required:** Run `npm --prefix frontend run format:write` (or equivalent) on the
affected files; confirm `just dev lint frontend` exits 0.

#### FP3-03 · LOW · Rust lint gate RED (temporal.rs, commit `42b0e48`, coordination)

A rustfmt diff in `engine/crates/vaultspec-api/src/routes/temporal.rs` blocks the
shared Rust lint gate. Authored in `42b0e48` by a different commit path; not P03's
code. The gate is shared — must clear for P03 to claim a green run.

#### FP3-PASS · Layer-boundary integrity

- `camera.ts`, `edgeMeshes.ts`, `fieldAssembly.ts`: scene-layer modules, no React
  imports, no stores imports. Clean.
- `sceneMapping.ts`: wire→seam translation only; no React, no stores. Clean.
- `graphSync.ts`: in `stores/server/`, reads TanStack Query + liveStatus. Correct
  layer. Clean.
- `Stage.tsx`: uses stores hooks, calls `SceneController.command()` only. Feature
  deltas routed through `apply-deltas`, never direct renderer access. Clean.

#### FP3-PASS · Spec/ADR conformance

- `graphDeltaToScene`: null guard for no-node-no-edge entries correct; snake_case
  rename (`member_count → memberCount`, `breakdown_by_tier → breakdownByTier`)
  honored. Matches contract §4 / constellation-live-delta S05.
- `useGraphLiveSync`: `sinceArg` folds keyframeSeq into stream cache key (stream-01
  adversarial property: different `since` values cannot share cached data). Gap
  detection seeded from `keyframeSeq` so seq=keyframeSeq+1 is not falsely flagged.
  Matches ADR D1/D3. Debounced invalidation (P-HIGH-1) intact.
- `Stage.tsx` spliceLive effects: three-effect structure correct — (1) set-data on
  keyframe merge, (2) apply-deltas on `featureDeltas`, (3) invalidateQueries on
  `gapCount`. Resilient floor honored. Gap fallback uses the correct cache key
  (`[...engineKeys.all, "graph", scope]`, exact: false). Matches ADR D2/D3.
- `Camera.animateTo`: damped lerp (damping=0.85, 0.5px/0.001 stop), `cancelAnimation`
  on every gesture. `focus-node` and minimap navigate-to both use `animateTo`.
- `EdgeMeshLayer.updateEdge`: fast-path for `change` with same group key; add/remove
  fall back. `setArrowVisibility` toggled by `camera.onChange` at
  `ARROW_VISIBLE_SCALE=1.6` (document LOD). Arrow geometry: 3-vertex triangles,
  12px depth, 4px half-width. All correct per P03.S08/S09.

**Verdict: WITHHELD.** FP3-01 (HIGH) and FP3-02 (MEDIUM) are required revisions.
fe-live-graph's forward work (P04 or any downstream phase) is blocked until both
are resolved and the re-check passes.

### Recommendations (addendum)

1. **fe-chrome (task #6):** Run Prettier on the six committed files. Confirm
   `just dev lint frontend` green. Provide commit SHA for task #6 re-check close.
2. **fe-live-graph (P03):** Add `Camera.animateTo` and `EdgeMeshLayer.updateEdge`
   tests (FP3-01). Fix Prettier on `sceneMapping.test.ts`, `graphSync.test.tsx`,
   `sceneController.ts` (FP3-02). Fix Rust lint in `temporal.rs` (FP3-03). Provide
   commit SHA for P03 re-check.
3. **review-revision-precedence:** Both task #6 and P03 are withheld. No forward
   work may begin until each executor's revision re-check passes.

---

## Addendum — 2026-06-13 · Task #6 re-check close + Task #7 revision accepted

### Task #6 final re-check (fe-chrome, commits `fcc60ab` + `99ce937` + `5b2eff0`)

Gates verified independently:
- ESLint: CLEAN ✓
- Prettier (format:check): CLEAN — all matched files use Prettier code style ✓
- TypeScript (tsc -b): CLEAN ✓
- Tests: 439/80 GREEN ✓

All withhold conditions cleared:
- F6-01 (untracked files): RESOLVED in `fcc60ab`. ✓
- F6-02 (no tests): RESOLVED in `fcc60ab` — `AlgorithmPanel.test.ts`,
  `FilterSidebar.test.ts`, `NavToolbar.test.ts`, `MinimapWidget.test.ts` (5 test
  files, quality adequate; LEVEL_LABEL completeness and uniqueness, DEFAULTS shape,
  applyParams merge semantics, seam contract lifecycle, facet toggle/reset all covered).
- F6-03' (Prettier on committed files): RESOLVED — format:check exits 0.

Granularity toggle (`5b2eff0`) — in-scope extension, reviewed and accepted:
- `viewStore.ts` adds `granularity: "document" | "feature"` (default "feature") and
  `setGranularity`; `setScope` resets to "feature" — correct isolation per the scope-
  isolation invariant (finding 022 guard).
- `NavToolbar.tsx` reads `useViewStore` for granularity and calls `setGranularity` on
  toggle — chrome reads/writes view store (correct layer); no fetch, no direct engine
  access. Layer boundary: CLEAN.
- `Stage.tsx` reads `useViewStore((s) => s.granularity)` and passes to
  `useGraphSlice` — stores layer handles the refetch; scene-layer boundary unchanged.
- `viewStore.test.ts` covers the granularity default and reset-on-scope-swap invariant.
- S50 limitation (docs-mode live sync falls back to refetch) is honest, pre-existing,
  and correctly noted in the commit message.

**Verdict: PASS.** Task #6 is closed.

### Task #7 revision accepted (fe-chrome, `99ce937`)

F7-01 (no `ChangesOverview.test.ts`): RESOLVED — `ChangesOverview.test.ts` added in
`99ce937` with 39 tests covering `eventGlyph`, `eventLabel` (including HEAD→SHA-8
fallback, short-SHA passthrough, branch name extraction), `relativeTs` (age bands),
`basename`, and `isVaultPath`. Quality is high; the `makeEvent` fixture pattern is
idiomatic for the test suite.

F7-02 (uncommitted enhancements): RESOLVED — the richer working-tree version is now
committed in `99ce937`.

**Task #7 is fully closed.** No outstanding findings.

---

## Addendum — 2026-06-13 · P03 re-check close (`b1aef89`)

### Gates (committed state, `b1aef89`)

- **Tests:** 452 passed (80 files) — 13 new tests over the prior 439. GREEN ✓
- **ESLint:** clean, 0 warnings. GREEN ✓
- **Prettier (format:check):** Working tree shows 2 failures (`AlgorithmPanel.tsx`,
  `FilterSidebar.tsx`). Stash-and-check against committed state exits 0 — "All
  matched files use Prettier code style!" The live failures are from fe-chrome's
  in-flight task #8 token-adoption working-tree changes (`M` on those files); HEAD
  is clean. GREEN (committed state) ✓
- **TypeScript:** clean, 0 errors. GREEN ✓
- **Rust lint (FP3-03 coordination):** Still RED — `temporal.rs` rustfmt diff from
  `42b0e48`, attributed to engine team, not P03 code. Pending resolution by engine.

### FP3-01 — RESOLVED

**Camera.animateTo — 7 tests added to `camera.test.ts`:**
Quality is high. RAF mock uses `vi.stubGlobal` with a single-slot pending frame;
`flush()` drives to completion, `tick()` advances one frame (enabling mid-flight
assertions), `idle()` checks RAF slot clearance. Container stub covers exactly what
`Camera.apply()` calls (position.set + scale.set); no WebGL. Key tests: no-overshoot
(snaps to exact target), onDone fires exactly once, idleness after completion,
panBy/set/zoomAt all cancel in-progress animation, second animateTo cancels first.
The panBy test is the discriminating one — it verifies mid-flight position then
confirms the gesture interrupts with the pan delta from that position.

**EdgeMeshLayer.updateEdge — 6 tests added to `edgeMeshes.test.ts`:**
`seedLayer()` helper bypasses GPU-bound `rebuild()` by injecting `lastEdges` and
`groups` via type assertion on private fields — correct headless pattern. Covers:
fast-path (same group key → true), add/remove fall-throughs (→ false), unknown id
(→ false), group-key shift via tier change (→ false), in-place patch verified via
`lastEdges[0].relation` read after a successful update.

### FP3-02 — RESOLVED

`sceneMapping.test.ts`, `graphSync.test.tsx`, `sceneController.ts` clean in committed
state. FP3-02 is closed.

### FP3-03 — Outstanding coordination item

Rust lint (`temporal.rs` rustfmt diff, `42b0e48`) is not P03's code. Remains open as
a coordination item for the engine team; does not block P03's verdict.

**Verdict: PASS.** P03 is closed. FP3-03 remains open as a coordination item.

---

## Addendum — 2026-06-13 · Task #8 visual lift (`f86f6bb` + `2b8fb42` + `10841d5`)

### Gates (committed state — stash-and-verify; live working tree contains fe-chrome in-flight changes)

- **Tests:** 452 passed (80 files). GREEN ✓
- **ESLint:** clean, 0 warnings. GREEN ✓
- **Prettier (format:check):** `git stash` → "All matched files use Prettier code style!" GREEN ✓
- **TypeScript:** clean, 0 errors. GREEN ✓

### Axis 1 · Spec/ADR Conformance — PASS

- **F6-04 (placeholder glyphs) — RESOLVED.** All Unicode placeholder glyphs
  (`−/+/⊡/↺/⚙/⛶/‹/›/☀/☾/✕/▾/▸/×`) replaced with Lucide React icons across 8
  surfaces (NavToolbar, AppShell, FilterSidebar, AlgorithmPanel, MinimapWidget,
  Inspector, VaultBrowser, WorkingSet). Icon sizes are consistent (11–13 px) and
  receive colour from text-* token classes, so dark-mode remap is automatic.

- **Motion tokens registered and applied.** Four new CSS custom properties in
  `styles.css` (`--animate-fade-in`, `--animate-slide-in-left`,
  `--animate-slide-in-up`, `--animate-slide-in-down`) backed by `@keyframes`
  blocks. Applied: `animate-slide-in-left` → FilterSidebar panel mount;
  `animate-slide-in-up` → AlgorithmPanel panel mount; `animate-slide-in-down` +
  `animate-fade-in` → CommandPalette dialog + backdrop. All keyed on mount (no
  replay on update).

- **`--color-canvas-bg` token properly scoped.** Light (`#faf9f7`) and dark
  (`#211e1a`) values registered under `:root` and `[data-theme="dark"]`
  respectively in `styles.css`. `PixiField` reads at mount via
  `getComputedStyle(document.documentElement)` and tracks subsequent theme
  switches with a `MutationObserver` on the `data-theme` attribute — the observer
  is disconnected in `destroy()`, no leak. `MinimapLayer.render()` reads
  `--color-canvas-bg` and `--color-rule` on each draw. Replaces the hardcoded
  `FIELD_BACKGROUND = 0xfaf9f7` constant.

### Axis 2 · Layer Boundary Integrity — PASS

- All changed files are in `frontend/src/app/` (chrome) and
  `frontend/src/scene/` (scene). No chrome or scene code calls `fetch()` directly
  against the engine; the two `refetch()` hits in the grep are TanStack Query's
  `QueryObserver.refetch()` (valid stores-layer API calls, pre-existing).
- Scene changes (`pixiField.ts`, `minimapLayer.ts`) read CSS custom properties via
  `getComputedStyle` — correct DOM API usage, does not touch stores or make HTTP
  calls. Layer boundary map intact.

### Axis 3 · Adversarial Suite + Gates — PASS

452/80 tests green, ESLint clean, Prettier clean (committed state), TypeScript
clean. Adversarial suite (`src/stores/__adversarial__/`) unchanged and unaffected.

### Axis 4 · Visual/UX Quality — PASS

Token sweep is **complete**: `git grep` for `stone-|amber-|emerald-|zinc-|gray-[0-9]|slate-[0-9]` across `frontend/src/app/**` and `frontend/src/scene/**` returns zero matches. Semantic mapping is precise:

| Before | After | Semantic |
|---|---|---|
| `bg-emerald-600` | `bg-state-live` | live connection indicator |
| `bg-amber-600` / `text-amber-700` | `bg-state-stale` / `text-state-stale` | degraded/stale state |
| `border-amber-*` / `bg-amber-50` | `border-state-stale/30` / `bg-paper-raised` | offline banner |
| `text-stone-400` | `text-ink-faint` | de-emphasised chrome text |
| `bg-stone-200` / `text-stone-900` | `bg-accent-subtle` / `text-ink` | active selection |
| `border-stone-200` / `bg-stone-100` | `border-rule` / `bg-paper-sunken` | inactive chip |
| `fill-stone-*` / `stroke-stone-*` | `fill-ink-*/fill-rule/stroke-rule*` | Timeline SVG data ink |
| `text-emerald-600` (fresh badge) | `text-state-active` | freshness indicator |
| `border-emerald-700` / `bg-emerald-50` | `border-state-active/40` / `bg-accent-subtle` | plan step active |

The canvas dark fix completes the visual story: Pixi background and minimap ground
both follow `--color-canvas-bg` in real time on theme switch, so the Obsidian
document graph renders on dark without a remount.

### Outstanding items (coordination, not blocking task #8)

- **FP3-03 (Rust lint / `temporal.rs`):** Attributed to engine team (`42b0e48`).
  Still not resolved in main. Coordination item; does not affect the frontend gate.

**Verdict: PASS.** Task #8 is closed. F6-04 is fully resolved. The visual quality
lift is complete, dark mode is end-to-end consistent, and the prototype review
cycle is done.

---

## Addendum — 2026-06-13 · fe-live-graph dark-mode graph colours (`10841d5` + `4bf028a`)

`10841d5` was already covered in the task #8 PASS above. This addendum covers
`4bf028a` (node/edge/label colours through the design-token layer).

### Gates (committed state — stash-and-verify)

- **Tests:** 452 passed (80 files). GREEN ✓
- **ESLint:** clean. GREEN ✓
- **Prettier:** All matched files use Prettier code style! GREEN ✓
- **TypeScript:** clean. GREEN ✓

### Axis 1 · Spec/ADR Conformance — PASS

- **Hardcoded palette constants eliminated.** `PAPER`, `TIER_BASE_COLORS`, and
  `STATE_COLORS` replaced with CSS-token-backed functions (`readPaper()`,
  `readTierColors()`, `readStateColors()`). Every token used — `--color-tier-*`,
  `--color-state-*`, `--color-canvas-bg`, `--color-ink`, `--color-ink-muted` —
  has both light and dark theme values verified in `styles.css`. None fall
  silently to the hardcoded fallback in dark mode.

- **`mixTowardPaper(color, amount, paper?)` backward-compatible.** Optional
  `paper` param defaults to `{ r: 0xfa, g: 0xf9, b: 0xf7 }` (identical to the
  old `PAPER` constant). Existing unit tests pass with no change.

- **`groupColor()` defensive fallback.** Previous code returned `undefined` for
  unknown tier keys (e.g. `TIER_BASE_COLORS[unknownTier]`); now falls back to
  `tc.declared` / `tc["structural:resolved"]`. Minor correctness improvement.

- **Theme live-rebuild.** `fieldAssembly.ts` installs a `MutationObserver` on
  `data-theme` in `onReady()` that calls `applyModelToLayers(false)` — rebuilds
  sprite tints, anatomy text colours, and edge mesh groups immediately on theme
  toggle. Observer disconnected via the existing `detachListeners` pattern
  (`() => themeObserver.disconnect()` pushed to the array). No leak.

### Axis 2 · Layer Boundary Integrity — PASS

All changes in `frontend/src/scene/field/`. `getCssColor()` reads CSS custom
properties via `getComputedStyle` — correct DOM API, no stores access, no
`fetch()`. Layer ownership map intact.

### Axis 3 · Gates — PASS

452/80 GREEN · ESLint CLEAN · Prettier CLEAN · TypeScript CLEAN. The
`typeof document === "undefined"` guard means existing unit tests exercise the
fallback path (light-mode values = old constants) so semantic coverage is
unchanged.

### Axis 4 · Visual/UX Quality — PASS

Every colour decision in the scene layer now flows through the token layer. In
dark mode: tier colours lighten appropriately (`--color-tier-declared` light
`#3a342c` → dark `#d8d2c6`), state colours shift to accessible lighter values,
node labels (`--color-ink` dark `#e8e3da`) and tier badges (`--color-ink-muted`
dark `#a39b8f`) are legible on the dark canvas. The paper-mix target in
`readPaper()` resolves to `#211e1a` in dark mode so low-confidence edge hazes
fade toward the actual canvas ground rather than the light `#faf9f7`.

### LOW observations (non-blocking)

**FG1-01 · LOW · `getCssColor()` duplicated between `edgeMeshes.ts` and `nodeSprites.ts`**
Identical 10-line helper in both files. No shared utility import exists in this
directory today; the duplication avoids a cross-file coupling in the scene's
internal layer. Acceptable for now; a future `cssTokens.ts` utility in
`scene/field/` would consolidate it.

**FG1-02 · LOW · `mixTowardPaper` optional `paper` arg has no dedicated test**
The function is pure and the new arg is easily testable
(`mixTowardPaper(0x000000, 1.0, { r: 0x21, g: 0x1e, b: 0x1a })` should equal
`0x211e1a`). The existing mixing-math tests pass the default, which verifies the
logic is correct; the optional param is not independently verified. Not blocking,
but a one-line addition to `edgeMeshes.test.ts` would close it.

**Verdict: PASS.** `4bf028a` is accepted. The graph canvas now renders
correctly in both light and dark themes, end-to-end.

---

## Addendum: Task #9 — time-travel wire shape fix (`c812371`)

**Date:** 2026-06-14 · **Reviewer:** fe-reviewer · **Commit:** `c812371`

### Scope

`frontend/src/stores/server/engine.ts`, `frontend/src/app/timeline/timeTravel.ts`,
`frontend/src/testing/mockEngine.ts`, `frontend/src/testing/mockEngine.test.ts`,
`frontend/e2e/smoke.spec.ts`. Plan W03.P04.S07 check + S49 divergence item 1 closure.

### Gate results (independently verified)

| Gate | Result |
|---|---|
| `npm run typecheck` | CLEAN — 0 errors |
| `npm run lint` | CLEAN — 0 warnings |
| `npm run test` | 453/453 passed |

### Axis findings

**SPEC/ADR** — Type fix correct: `GraphAsofResponse` previously declared nonexistent
`seq: number` and `t: number`; live wire returns `t` as the echoed string param and
carries `last_seq` (inherited from `GraphSlice`), not `seq`. Removing `seq` and
widening `t: string | number` aligns the type contract with the real wire. `scrubTo`
coerces `Number(asof.t)` before storing as timeline cursor. `keyframeSeq` derivation
(`asof.last_seq ?? (diffDeltas[0]?.seq ?? 1) - 1`) handles the S50 null gap
gracefully: when the engine returns `last_seq: null`, the delta batch's first seq minus
one is used as the keyframe origin, guaranteeing no gap on `log.append`. Empty-diff
fallback yields `keyframeSeq = 0` — valid origin, first arriving delta at seq ≥ 1 is
gap-free. Mock updated to return `last_seq` (not `seq`) per
`mock-mirrors-live-wire-shape`. Smoke `test.fixme` correctly removed: engine
ms-timestamp support ships in `asof.rs` resolve_commit fallback (S49 item 1 closed).
W03.P04.S07 check is valid — the `spliceLive` live-delta path was already implemented
in `graphSync.ts` + `Stage.tsx`; this commit closes the asof normalization that made
time-travel splicing produce incorrect seqs and broken DeltaLog ordering.

**LAYER** — **T9-01 LOW (pre-existing):** `useTimeTravel` in `src/app/` passes
`engineClient` directly into `TimeTravelDriver` (ADR G4.b W02.P08.S34 decision). The
driver itself uses constructor DI (portable), but the app-layer hook violates
`dashboard-layer-ownership` ("chrome never calls engine directly"). No new engine access
introduced by `c812371`. Tracked as boundary debt for a future stores-mediation pass.

**GATES** — Independently confirmed clean on committed state.

**VISUAL** — N/A.

### Verdict: PASS

`c812371` accepted. T9-01 LOW is pre-existing boundary debt, non-blocking. Time-travel
scrubbing now produces correct keyframe seqs and the smoke test runs live.

---

## Addendum: Task #11 — FA2 convergence + idempotent mount (`9158fd8`)

**Date:** 2026-06-14 · **Reviewer:** fe-reviewer · **Commit:** `9158fd8`

### Scope

`frontend/src/scene/field/fa2Convergence.ts` (new), `frontend/src/scene/field/fa2.worker.ts`,
`frontend/src/scene/field/fa2Convergence.test.ts` (new),
`frontend/src/scene/field/fieldAssembly.ts`, `frontend/src/scene/field/fieldAssembly.test.ts` (new),
`frontend/src/scene/field/pixiField.ts`. W02.P03.S05 + S06.

### Gate results (independently verified on committed HEAD including `484e9a2`)

| Gate | Result |
|---|---|
| `npm run typecheck` | CLEAN — 0 errors |
| `npm run lint` | CLEAN — 0 warnings |
| `npm run test` | 465/465 passed (82 files) — 12 new tests (7 S05 + 5 S06) |

### Axis findings

**SPEC/ADR** — S05: `ConvergenceDetector` correctly extracted as a pure, testable module.
`tick()` returns `true` after `CONVERGENCE_WINDOW=10` consecutive ticks with
`maxDisplacement < CONVERGENCE_THRESHOLD=0.5`. Boundary condition is strict `<` (at-threshold
counts as not-below and resets the window — confirmed by test). Worker integration:
snapshot→`forceatlas2.assign`→measure-max-displacement→stop sequence is correct. Restart
on `change`/`params` when already converged correctly re-settles to new data/config.
Reset on all four message types (`init`/`start`/`change`/`params`) is complete. S06:
`assemblyMounted` guard prevents duplicate `onReady` registrations on repeated `mount()`
calls before `destroy()`. `destroy()` resets the guard so a subsequent `mount()` works.
SSR/node guard added to `PixiField.mount()` is consistent with the `edgeMeshes`/
`nodeSprites` pattern and required for tests.

**LAYER** — All changes are in `src/scene/field/`. No imports from `stores/` or `app/`
in the new modules. `fa2Convergence.ts` is pure computation (no DOM, no PixiJS). ✓

**GATES** — Independently confirmed: 465/465, TSC clean, ESLint clean.

**VISUAL** — FA2 stops automatically when displacement settles for 10 consecutive ticks.
CPU-fan-never-stops bug is closed. Users triggering `change`/`params` cause re-settle.
No visual regression expected.

### LOW observations (non-blocking)

**S11-01 · LOW · `before` Map allocated on every tick with nodes**
`computeMaxDisplacement` creates a `new Map<string, {x, y}>()` on every FA2 tick.
At 1000 nodes × 60fps this is GC work per tick cycle. Runs in a Web Worker (off
main thread), so no frame drops. Acceptable; future optimization path: retain a
flat `Float64Array` of previous positions and update it in-place.

### Verdict: PASS

`9158fd8` accepted. FA2 now converges and stops; mount is idempotent.

---

## Addendum: Task #12 — Dispatch consolidation + CI perf gate (`484e9a2`)

**Date:** 2026-06-14 · **Reviewer:** fe-reviewer · **Commit:** `484e9a2`

### Scope

`frontend/src/app/palette/CommandPalette.tsx`, `frontend/src/app/right/OpsPanel.tsx`,
`frontend/src/app/timeline/timeTravel.ts` (cosmetic Prettier reformat only),
`frontend/e2e/perf.spec.ts` (new), `frontend/playwright.perf.config.ts` (new).
W03.P04.S08 + W01.P01.S02.

### Gate results (independently verified)

| Gate | Result |
|---|---|
| `npm run typecheck` | CLEAN — 0 errors |
| `npm run lint` | CLEAN — 0 warnings |
| `npm run test` | 465/465 passed (no new Vitest tests; perf spec is Playwright-only) |

### Axis findings

**SPEC/ADR** — S08: `useConfirmable` adoption is correct on both surfaces. Per-button
`useConfirmable<void>(\`ops:${target}:${verb}\`)` in `OpsButton` gives each button its
own guard slot — buttons cannot cross-arm. Navigate-to-different-armed-command re-arms
correctly: `cancel()` + `trigger()` sequence. `onSettled` removal is safe — `cancel()`
synchronously clears the guard slot before `mutate()` fires, so the slot cannot leak.
Inline cancel affordance per button replaces the shared bottom-level cancel. **Critical
fix:** `CommandPalette.runOp` previously called `engineClient.opsCore/opsRag` directly
(seam bypass in `app/`); now routes through `dispatchOps` → `appDispatcher` terminal
handler registered in `opsActions.ts` at module load. Layer violation closed.
S02: `perf.spec.ts` waits for `__SPIKE_RESULTS__.done === true` (90s timeout),
then asserts all three ADR D1 p95 budgets with identifying failure messages. Port 5176
distinct from adverse port 5174. SwiftShader (`--use-gl=swiftshader`) satisfies WebGL
in headless CI. Three-minute test timeout for slow CI hardware.

**LAYER** — `CommandPalette` seam bypass closed: `engineClient` import removed, engine
call now flows `dispatchOps` → `appDispatcher` → terminal handler. `OpsPanel.useMutation`
retains its own direct engine call in the `mutationFn` (pre-existing; not in S08 scope).
Net improvement: from two scattered direct engine calls in `app/` to one centralized
terminal registration.

**GATES** — Independently confirmed: 465/465, TSC clean, ESLint clean.

**VISUAL** — Arm-to-confirm UX preserved on both surfaces. OpsPanel per-button inline
cancel is a UX improvement over the shared bottom-level cancel.

### LOW observations (non-blocking)

**S12-01 · LOW · `OpsPanel.useMutation` engine call pre-existing**
The `useMutation` `mutationFn` in `OpsPanel` calls engine directly (not through
`dispatchOps`). Pre-existing; outside S08 scope (which targeted the confirm-guard
consolidation). Two code paths for ops firing now exist: CommandPalette via dispatch
seam, OpsPanel via useMutation. Tracking for a future unification pass.

**S12-02 · LOW · Armed `OpsButton` stays armed when `disabled` transitions to true**
If `disabled` becomes true mid-confirm (another op pending), the armed state persists
in the guard slot. Cancel button remains functional (no `disabled` prop), so the user
can dismiss. In the old `OpsPanel`, `onSettled` reset `confirming` when the mutation
finished, implicitly clearing any stale confirm. Benign; cancel resolves it.

### Verdict: PASS

`484e9a2` accepted. S08 confirm guard consolidated; direct `engineClient` bypass in
CommandPalette closed; CI perf gate ships with all three ADR D1 p95 budgets asserted.

---

## Addendum: Task #10 — engine hardening P03.S07 gate (`4a409f7` → `041da6b`) — CORRECTED

**Date:** 2026-06-14 · **Reviewer:** fe-reviewer · **Commits:** `4a409f7`, `553cf8c`, `078063a`, `faad874`, `041da6b`

> **Correction note:** An initial verdict was issued for scope `4a409f7`→`faad874`
> with gate results that omitted `npm run format:check`. `engineConformance.test.ts`
> was committed prettier-dirty at `faad874` (three-line method chain vs. Prettier's
> one-line form). Team-lead independently caught the failure via `just dev lint
> frontend`. fe-platform corrected with `041da6b` (style: prettier-format
> `engineConformance.test.ts`). This addendum supersedes and retracts the prior
> verdict. The omission of `format:check` from the reviewer gate is the third
> instance of this pattern this cycle; codified by team-lead in `0d279bd`.

### Scope

`frontend/src/testing/engineConformance.test.ts` (new, prettier-fixed in `041da6b`),
`.github/workflows/quality-gates.yml` (new CI job),
`engine/crates/ingest-git/src/worktrees.rs` (ahead/behind),
`engine/crates/vaultspec-api/src/routes/query.rs` + `stream.rs`,
`frontend/src/stores/server/engine.ts` + `liveAdapters.ts` (TS types),
`engine/tests/tests/degradation_adversarial.rs` (new). ADR decisions D1/D2/D4.

### Gate results (independently verified against `041da6b`)

| Gate | Result |
|---|---|
| `cargo fmt --all -- --check` | EXIT 0 — CLEAN |
| `cargo clippy --workspace --all-targets -D warnings` | CLEAN — 0 warnings |
| `cargo test --workspace` | All suites `test result: ok.` — 0 failures |
| `npm run format:check` | CLEAN — all matched files use Prettier code style |
| `npm run typecheck` | CLEAN — 0 errors |
| `npm run lint` | CLEAN — 0 warnings |
| `npm run test` (Vitest) | 465 passed / 9 skipped (82 files passed / 1 skipped) |

Note: the "declared tier unavailable" log lines visible in `cargo test` stderr are
expected output from the degradation adversarial tests confirming the failure modes
are correctly triggered — not test failures.

### Axis findings

**SPEC/ADR — D1 (TS conformance CI):** `describe.skipIf(!BASE_URL)` correctly skips
the entire suite in normal vitest runs (9 tests, 1 file skipped). The critical
regression gate: `expect("seq" in asof).toBe(false)` is the exact assertion that
would have caught `c812371` before it shipped — a TS type declaring `seq: number` would
pass Rust conformance but fail this test. All 9 test scopes are correct: map/status
tiers, `graphAsof` echoed-t coercion + `last_seq` present + `seq` absent, `graphDiff`
shape, 4xx error envelope (`every-wire-response-carries-the-tiers-block`), search flat
shape (S49 regression coverage). CI job readiness poll: ADR LOW closed as-built — the
shell loop (`service.json` non-zero port + non-empty token, 30s / 1s interval) matches
the Rust `start_serve()` helper pattern precisely.

**SPEC/ADR — D2 (git ahead/behind):** `try_ahead_behind` reads `branch.<name>.remote`
and `.merge` from a gix config snapshot, constructs the tracking ref as
`refs/remotes/{remote}/{merge_short}`, and walks both reachability sets as `HashSet`
to compute the symmetric difference. Every error path returns `None` via `?` — detached
HEAD, no upstream, gix walk failure all degrade gracefully without failing the caller.
The `adaptMap` null-to-undefined mapping distinguishes "tracking unknown" from "0 ahead"
correctly. Unit test: bare-clone fixture, one unpushed commit → `ahead=1, behind=0`. 19
ingest-git tests pass (1 new).

**SPEC/ADR — D4 (degradation adversarial):** HOME/USERPROFILE redirect for rag-down
is cleaner than the ADR's "bound-but-unserved port" sketch (service.json discovery
fails at the filesystem level — no port binding required). PATH empty-dir for core-down
is correct. Healthy-baseline test covers all four canonical tiers across `/status`,
`/map`, `/graph/query`, and a 4xx — the same four surfaces that have historically
drifted. Each test has its own `ServeGuard` + fixture — independent, no shared state.
All 3 degradation tests pass.

**LAYER** — D1 test file is in `frontend/src/testing/` (correct location). D2 engine
changes are in `ingest-git/src/` and route handlers; TS types land in `engine.ts`
(stores layer, sole wire client). D4 tests are in `engine/tests/`. No boundary
violations.

**GATES** — All seven gates independently confirmed clean on `041da6b`.

**VISUAL** — N/A. Ahead/behind fields available on the wire for future NowStrip UX.

### Verdict: PASS (corrected)

`4a409f7`→`041da6b` accepted. Contract drift is now a CI failure; worktree sync
awareness lands on the wire; degradation honesty is adversarially verified. All three
ADR decisions delivered; D3 correctly closed without code.

Reviewer gate discipline updated: `npm run format:check` is a mandatory explicit step
in the frontend gate — it is not covered by `npm run lint`. Prior verdict for
`4a409f7`→`faad874` is retracted.
