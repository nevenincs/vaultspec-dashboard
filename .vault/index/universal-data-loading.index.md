---
generated: true
tags:
  - '#index'
  - '#universal-data-loading'
date: '2026-07-11'
modified: '2026-07-11'
related:
  - '[[2026-07-11-universal-data-loading-P01-S01]]'
  - '[[2026-07-11-universal-data-loading-P01-S02]]'
  - '[[2026-07-11-universal-data-loading-P01-S03]]'
  - '[[2026-07-11-universal-data-loading-P01-S04]]'
  - '[[2026-07-11-universal-data-loading-P01-summary]]'
  - '[[2026-07-11-universal-data-loading-P02-S05]]'
  - '[[2026-07-11-universal-data-loading-P02-S06]]'
  - '[[2026-07-11-universal-data-loading-P02-S07]]'
  - '[[2026-07-11-universal-data-loading-P02-S08]]'
  - '[[2026-07-11-universal-data-loading-P02-summary]]'
  - '[[2026-07-11-universal-data-loading-P03-S09]]'
  - '[[2026-07-11-universal-data-loading-P03-S10]]'
  - '[[2026-07-11-universal-data-loading-P03-S11]]'
  - '[[2026-07-11-universal-data-loading-P03-S12]]'
  - '[[2026-07-11-universal-data-loading-P03-S13]]'
  - '[[2026-07-11-universal-data-loading-P03-summary]]'
  - '[[2026-07-11-universal-data-loading-adr]]'
  - '[[2026-07-11-universal-data-loading-plan]]'
  - '[[2026-07-11-universal-data-loading-reference]]'
---

# `universal-data-loading` feature index

Auto-generated index of all documents tagged with `#universal-data-loading`.

## Documents

### adr

- `2026-07-11-universal-data-loading-adr` - `universal-data-loading` adr: `One data-activity plane: universal loading state, drain progress, and gated always-on streams` | (**status:** `accepted`)

### exec

- `2026-07-11-universal-data-loading-P01-S01` - Create the bounded drain-progress slice: a zustand store keyed by listing id holding pagesLoaded/rowsLoaded/complete, entries pruned on settle or error, with a narrow write seam the wire client can call without importing chrome
- `2026-07-11-universal-data-loading-P01-S02` - Report per-page progress from the vaultTree and codeFiles cursor walks into the drain-progress seam (start/page/settle/error), leaving walk semantics and the complete-set drain unchanged
- `2026-07-11-universal-data-loading-P01-S03` - Build useDataActivityView: aggregate useIsFetching/useIsMutating (excluding stream queries by key predicate), the drain-progress slice, and the live-connection slice into one interpreted { active, determinate, kind } view with show-grace and minimum-visible hold, keeping raw-selector discipline per frontend-store-selectors
- `2026-07-11-universal-data-loading-P01-S04` - Unit-test the activity core: drain slice bounds and pruning, SSE key exclusion, grace/hold debounce determinism, and determinate rollup from concurrent drains
- `2026-07-11-universal-data-loading-P01-summary` - `universal-data-loading` `P01` summary
- `2026-07-11-universal-data-loading-P02-S05` - Author the kit ActivityIndicator primitive (slim non-blocking bar, indeterminate + determinate modes, sr-only 'Loading data' label, token-only sizing) conforming to state-mode-uniformity and the Figma name-as-contract join
- `2026-07-11-universal-data-loading-P02-S06` - Mount the indicator once per shell branch reading only useDataActivityView (the desktop shell frame and the compact MobileTopBar) so no other surface re-derives activity
- `2026-07-11-universal-data-loading-P02-S07` - Add the held-slice refetch affordance: surface the graph slice's isFetching through GraphSliceAvailability and render a non-blocking corner 'Refreshing view' banner in the canvas overlay without ever blanking the held field
- `2026-07-11-universal-data-loading-P02-S08` - Test the chrome plane: indicator render modes and a11y label, both shell mounts, canvas refetch banner precedence against the existing designed-state table
- `2026-07-11-universal-data-loading-P02-summary` - `universal-data-loading` `P02` summary
- `2026-07-11-universal-data-loading-P03-S09` - Add the hidden-tab pause to the backends+git signal stream: after a document.hidden grace window close the subscription, resubscribe and re-snapshot on visibilitychange, with Status readers never reading the pause gap as degradation and the graph SSE untouched
- `2026-07-11-universal-data-loading-P03-S10` - Make the vault-tree listing progressive: serve the first page immediately, continue the drain in the background with drain-progress reporting, expose complete:false on the surface view, and re-run client narrowing when the drain completes
- `2026-07-11-universal-data-loading-P03-S11` - Render the honest partial-narrow affordance in the rail while the tree drain is incomplete ('N of an at-least total' with the loading floor), and guard-test narrow-during-drain so matches beyond the loaded prefix never silently vanish
- `2026-07-11-universal-data-loading-P03-S12` - Codify the mount-gating visibility law (heavy data hooks live only under components that render their data, no visibilityState-enabled queries) as a project rule source and sync
- `2026-07-11-universal-data-loading-P03-S13` - Run the full gate (just dev lint frontend + vitest suite) green and route the diff to vaultspec-code-review
- `2026-07-11-universal-data-loading-P03-summary` - `universal-data-loading` `P03` summary

### plan

- `2026-07-11-universal-data-loading-plan` - `universal-data-loading` plan

### reference

- `2026-07-11-universal-data-loading-reference` - `universal-data-loading` reference: `loading-state and streaming architecture audit`
