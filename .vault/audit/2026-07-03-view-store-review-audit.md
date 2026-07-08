---
tags:
  - '#audit'
  - '#view-store-review'
date: '2026-07-03'
modified: '2026-07-03'
related:
  - "[[2026-07-03-dashboard-state-centralization-audit]]"
  - "[[2026-07-02-global-state-review-audit]]"
---

# `view-store-review` audit: `zustand view-store layer implementation quality`

## Scope

Campaign continuation (2026-07-03, reviewer-driven, no subagents): the zustand store
layer — 33 `create()` stores across `frontend/src/stores/view/` (plus the three
server-side zustand slices in `graphSync`/`liveStatus`/`ragControl`). Dimensions:
stable-selectors rule compliance across ALL consumer sites (app + stores + scene),
accumulator bounds, boundary normalization, persistence discipline, and the
corpus/workspace reset architecture (`viewStore.setScope` / `swapWorkspace` /
`resetCorpusLocalStores`). Deep reads: `viewStore.ts` (reset paths, caps, eviction),
`browserTreeExpansion.ts`, `contextMenu.ts` and `shellLayout.ts` (the only two
`useShallow` sites), `editor.ts` and `unsavedEditGuard.ts` (reset-leak candidates),
`timeline.ts`. Finding IDs `VSR-###`.

## Findings

### VSR-001 | info | verdict: a disciplined layer — zero stable-selector violations, pervasive bounds, no reset leaks

- **Stable-selectors rule: fully honored.** Repo-wide sweeps for the violation
  classes the codified rule names — object/array-literal selectors, `.map`/`.filter`/
  `new Set` derivation inside selectors — found ZERO occurrences across every
  consumer site in the app. Exactly two `useShallow` sites exist (`contextMenu`
  `useContextMenuState`, `shellLayout` `useShellLayoutState`) and both are the
  sanctioned form: flat already-canonical raw fields, shallow-compared, with the
  typed derivation in a `useMemo` over the raw slice — each carrying the rule's
  rationale in place. Numerous stores carry the inverse comment ("derive outside,
  even under useShallow"), showing the rule is applied, not just filed.
- **Bounds: every accumulator carries a named cap at creation.** The sweep found
  caps throughout: tree disclosure (128, re-bounded on rehydrate against tampered
  payloads), pins (256), island anchors (128), working set, opened docs
  (`MAX_OPEN_DOCS` with a provisional-first eviction policy that protects the active
  tab), saved lenses (48 + name length), command registry (providers 64 × 256, 1024
  resolved), palette/feedback message lengths, pipeline/inspector expansion,
  commit-hash chrome, session-intent stamps (64). No only-growing structure was
  found.
- **Boundary normalization is uniform.** Every mutator takes `unknown` and
  normalizes at the store boundary (the `normalize*` idiom), so malformed input
  degrades to a no-op rather than corrupting state; unchanged writes return the same
  state reference (no churn).
- **Reset architecture: no corpus leak found.** `setScope` / `swapWorkspace` perform
  the wholesale 022 reset — one enumerated `resetCorpusLocalStores` (19 stores) +
  the view-store's own corpus-local field swap + RE-KEYING (not resetting) the
  per-scope persisted pin/lens stores, with the workspace-vs-scope key distinction
  handled and finding-traceable comments (022, isolation-01/02/03). The candidate
  leaks checked clean: `editor.ts` is a facade over view-store fields that DO reset;
  `unsavedEditGuard` is deliberately swap-surviving (it is the guard FOR the reset);
  `selectionReveal`'s stale nonce is harmless (consumers gate on the current
  selection); transient feedback/receipt stores are bounded and self-expiring;
  the graph live-delta store self-keys on scope.
- **Persistence discipline.** The persisted stores (tree disclosure, status-tab
  folds, pins/lenses via scoped keys) partialize only durable prefs, re-bound on
  rehydrate, and keep transient fields (known keys, roving focus) out of storage.

### VSR-002 | info | the corpus-reset enrollment is a hand-maintained list — drift risk on future stores

`resetCorpusLocalStores` is an explicit 19-call enumeration. A future corpus-coupled
store must remember to enroll; the only guard today is review. The explicit list is
arguably the right design (deliberate, readable, no module-load-order magic — a
self-registration pattern would silently skip stores never imported), so no change is
made; recorded so reviewers treat "new view store holding corpus-derived state" as a
trigger to check enrollment, and as the codification candidate if it ever regresses.

## Recommendations

- No remediation required — the second consecutive campaign audit closing with zero
  actionable findings. The layer's idioms (unknown-in normalization, named caps,
  reset enrollment, selector discipline with in-place rationale) are the house style
  to hold new stores to.
- Treat VSR-002's enrollment check as a standing review item for any new
  corpus-coupled store.
