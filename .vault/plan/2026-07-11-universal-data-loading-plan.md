---
tags:
  - '#plan'
  - '#universal-data-loading'
date: '2026-07-11'
modified: '2026-07-11'
tier: L2
related:
  - '[[2026-07-11-universal-data-loading-adr]]'
---

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the
       related: field above.
     - The related: field carries the AUTHORISING documents
       (ADR, research, reference, prior plan) for every Step in
       this plan. Steps inherit this chain; per-row reference
       footers do not exist.
     - NEVER use [[wiki-links]] or markdown links in the
       document body. -->

# `universal-data-loading` plan

### Phase `P01` - Data-activity core (stores plane)

Build the one stores-owned data-activity truth (ADR D1/D3 substrate): a bounded drain-progress slice fed by the wire client's cursor walks, and the aggregated useDataActivityView projection with anti-flicker grace/hold. No chrome in this phase; everything unit-tested against the live wire per the testing law.

- [x] `P01.S01` - Create the bounded drain-progress slice: a zustand store keyed by listing id holding pagesLoaded/rowsLoaded/complete, entries pruned on settle or error, with a narrow write seam the wire client can call without importing chrome; `frontend/src/stores/server/drainProgress.ts`.
- [x] `P01.S02` - Report per-page progress from the vaultTree and codeFiles cursor walks into the drain-progress seam (start/page/settle/error), leaving walk semantics and the complete-set drain unchanged; `frontend/src/stores/server/engine.ts`.
- [x] `P01.S03` - Build useDataActivityView: aggregate useIsFetching/useIsMutating (excluding stream queries by key predicate), the drain-progress slice, and the live-connection slice into one interpreted { active, determinate, kind } view with show-grace and minimum-visible hold, keeping raw-selector discipline per frontend-store-selectors; `frontend/src/stores/server/dataActivity.ts`.
- [x] `P01.S04` - Unit-test the activity core: drain slice bounds and pruning, SSE key exclusion, grace/hold debounce determinism, and determinate rollup from concurrent drains; `frontend/src/stores/server/dataActivity.test.ts`.

### Phase `P02` - Universal indicators (chrome plane)

Render the activity truth exactly once per shell branch (ADR D2): a kit-composed indicator primitive conforming to state-mode-uniformity (UI-only, sr-only label, tokens), mounted in the desktop shell chrome and the compact MobileTopBar, plus the canvas's missing held-slice refetch affordance as a non-blocking corner banner.

- [x] `P02.S05` - Author the kit ActivityIndicator primitive (slim non-blocking bar, indeterminate + determinate modes, sr-only 'Loading data' label, token-only sizing) conforming to state-mode-uniformity and the Figma name-as-contract join; `frontend/src/app/kit/ActivityIndicator.tsx`.
- [x] `P02.S06` - Mount the indicator once per shell branch reading only useDataActivityView (the desktop shell frame and the compact MobileTopBar) so no other surface re-derives activity; `frontend/src/app/AppShell.tsx + frontend/src/app/shell/MobileTopBar.tsx`.
- [x] `P02.S07` - Add the held-slice refetch affordance: surface the graph slice's isFetching through GraphSliceAvailability and render a non-blocking corner 'Refreshing view' banner in the canvas overlay without ever blanking the held field; `frontend/src/app/stage/CanvasStateOverlay.tsx + frontend/src/stores/server/queries.ts`.
- [x] `P02.S08` - Test the chrome plane: indicator render modes and a11y label, both shell mounts, canvas refetch banner precedence against the existing designed-state table; `frontend/src/app/stage/canvasStateOverlay.test.tsx + sibling chrome tests`.

### Phase `P03` - Streaming optimization + codification

Trim the always-on plane and make the largest listing progressive (ADR D4/D5): hidden-tab pause for the backends+git signal SSE with resume-safe resubscribe, first-page-first vault-tree rendering with honest partial-narrow affordance preserving the complete-set law, and codify the mount-gating visibility law as a project rule.

- [x] `P03.S09` - Add the hidden-tab pause to the backends+git signal stream: after a document.hidden grace window close the subscription, resubscribe and re-snapshot on visibilitychange, with Status readers never reading the pause gap as degradation and the graph SSE untouched; `frontend/src/stores/server/queries.ts (useBackendSignalStream) + frontend/src/stores/view/backendSignals.ts`.
- [x] `P03.S10` - Make the vault-tree listing progressive: serve the first page immediately, continue the drain in the background with drain-progress reporting, expose complete:false on the surface view, and re-run client narrowing when the drain completes; `frontend/src/stores/server/engine.ts + frontend/src/stores/server/queries.ts (useVaultTreeSurface)`.
- [x] `P03.S11` - Render the honest partial-narrow affordance in the rail while the tree drain is incomplete ('N of an at-least total' with the loading floor), and guard-test narrow-during-drain so matches beyond the loaded prefix never silently vanish; `frontend/src/app/left/TreeBrowser.tsx + guard test`.
- [x] `P03.S12` - Codify the mount-gating visibility law (heavy data hooks live only under components that render their data, no visibilityState-enabled queries) as a project rule source and sync; `.vaultspec/rules/ + vaultspec-core sync`.
- [x] `P03.S13` - Run the full gate (just dev lint frontend + vitest suite) green and route the diff to vaultspec-code-review; `frontend (full gate)`.

## Description

Implements the accepted universal-data-loading ADR (D1 - D5), grounded by the
same-feature reference audit. One stores-owned data-activity projection
(drain progress + fetch/mutation aggregate + stream connectedness) becomes the
single loading truth; one kit indicator renders it in each shell branch plus a
canvas held-slice refetch banner; the always-on backends+git signal SSE gains a
hidden-tab pause; and the vault-tree listing becomes first-page-progressive
with an honest partial-narrow affordance. The mobile graph-fetch suspicion was
disconfirmed by the audit, so no graph-plane gating changes land: mount-gating
is codified as the standing visibility law instead.

## Steps

## Parallelization

P01 must land before P02 (the indicator consumes useDataActivityView) and
before P03.S10 (progressive listing reports through the drain slice). Within
P01, S01 precedes S02 and S03; S04 closes the phase. Within P02, S05 precedes
S06; S07 is independent of S05/S06. P03.S09 (SSE pause) and P03.S12
(codification) are independent of everything else in P03 and may run in
parallel with P02; S10 precedes S11; S13 is the terminal gate step and runs
last.

## Verification

- A cold compact load shows the activity indicator during the vault-tree
  drain with determinate row progress, and the tree is interactive after the
  first page (live check on the canonical dev port).
- A desktop filter change on a held graph slice shows the corner refresh
  banner without blanking the field; the existing designed-state table in the
  canvas overlay tests still passes unchanged.
- The narrow-during-drain guard test proves no match beyond the loaded prefix
  silently vanishes while the drain is incomplete.
- Hiding the tab beyond the grace closes the backends+git EventSource;
  returning resubscribes and re-snapshots with no degradation banner (test +
  live check).
- No new fetch in chrome, no raw tiers reads, raw-selector discipline holds
  (existing guard suites stay green).
- `just dev lint frontend` and the full vitest suite exit 0; the
  vaultspec-code-review verdict on the diff is approve.
- Plan complete when every Step row is closed (`- [x]`).
