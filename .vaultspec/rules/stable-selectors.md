---
name: stable-selectors
---

# A store selector returns raw stable state; derivation happens in useMemo

## Rule

A zustand/`useSyncExternalStore` selector (`useViewStore`, `useMarkdownEditorChromeStore`,
any `create<…>()` store hook in `frontend/src/stores/` or `frontend/src/scene/`) must
return RAW, referentially-stable state — never a value freshly built inside the selector.
Any normalization, mapping, filtering, or object/array literal that mints a new reference
per call is done OUTSIDE the selector, in a `useMemo` keyed on the raw slice. `useShallow`
does NOT lift this constraint: it compares only one level deep, so a returned object whose
selector freshly derives a NESTED object or array still changes identity every snapshot.

## Why

A selector that returns a fresh reference on every call makes `getSnapshot` return a new
value each render; React logs `"The result of getSnapshot should be cached to avoid an
infinite loop"` and re-renders without end, which becomes `"Maximum update depth
exceeded"` and crashes the surface behind its `ErrorBoundary` (the Stage's blank canvas,
the markdown panel's crash-on-open). This is the dominant render-loop failure mode this
codebase keeps re-hitting, and it has held across at least four independent fixes: the
graph canvas `usePinnedDiscoveries` / `useGraphOverlays` normalizing inside the selector
(commit `14ac401c5b`), `useRecentCommitsChrome` re-capping a fresh `openHashes` array
inside a `useShallow` selector (`0c5647700c`), and `useMarkdownEditorChromeView` /
`useOpenDocs` returning nested-fresh objects — which crashed EVERY markdown-document open
until fixed (`5f146877e3`). The `useShallow` cases are the load-bearing subtlety: teams
reach for `useShallow` believing it stabilizes the result, but it only shallow-compares
top-level fields, so a freshly-derived nested field defeats it exactly as a bare fresh
return would.

## How

- **Good:** select the raw, stable slice and derive in `useMemo` —
  `const raw = useViewStore((s) => s.openDocs); return useMemo(() => normalizeOpenDocs(raw), [raw]);`.
  The store writes canonical values, so the raw reference is stable between mutations and
  the memo only recomputes when it genuinely changes.
- **Good:** a view with nested non-primitive fields selects each raw field separately
  (`s.nodeId`, `s.frontmatterDraft`, `s.advisories`) and assembles the derived view in a
  `useMemo` over those — never inside the selector, even with `useShallow`.
- **Good (already-safe):** a selector that returns a PRIMITIVE (`(s) => s.openDocs.length > 0`,
  a string, a boolean) is fine — primitives are value-compared, so no fresh reference
  escapes.
- **Bad:** `useViewStore((s) => normalizeOpenDocs(s.openDocs))` — `normalizeOpenDocs`
  returns a fresh array whenever the input is non-canonical, so the selector hands back a
  new reference every snapshot → `getSnapshot` loop → crash.
- **Bad:** `useStore(useShallow((s) => ({ rows: s.items.map(toRow) })))` — `useShallow`
  compares `rows` by reference, the `.map` is fresh each call, so it is never shallow-equal
  and loops anyway. Memoize the `.map` outside the selector instead.

## Status

Active. Codified 2026-06-21 on explicit user direction after the pattern recurred a fourth
time (`useMarkdownEditorChromeView` crashing all markdown-document opens). The fix shape —
select raw, derive in `useMemo` — is identical at every site.

## Source

Live debugging across the graph-backend-unification and document-manipulation work, not a
single audit document: commits `14ac401c5b` (`usePinnedDiscoveries`/`useGraphOverlays`),
`0c5647700c` (`useRecentCommitsChrome`), and `5f146877e3` (`useMarkdownEditorChromeView` /
`useOpenDocs` / `useDockWorkspaceTabsView`, plus the `useContentView` memoization that fed
them). Sibling rules `bounded-by-default-for-every-accumulator`,
`derived-projections-memoize-on-the-graph-generation` (the engine-side analogue —
memoize-on-generation), and `dashboard-layer-ownership` (the stores layer where these
selectors live).
