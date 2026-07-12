---
tags:
  - '#research'
  - '#mobile-unified-rail'
date: '2026-07-12'
modified: '2026-07-12'
related:
  - "[[2026-07-12-mobile-unified-rail-adr]]"
---

# `mobile-unified-rail` research: `merging the compact Browse and Status rails`

A light grounding pass for the `mobile-unified-rail` decision: confirm the seams the
merge touches, the concrete obstacles to stacking the two rails in one scroll, and the
existing primitives to reuse rather than reinvent. Scope is deliberately narrow — this
is a view-layer re-presentation of already-served data, so the research is a code
survey, not an options study (the options are settled in the ADR).

## Findings

**F1 — The compact shell switches one pane at a time.** `CompactAppShell.tsx` renders
its `<main>` (an `overflow-y-auto` region) as exactly ONE of `LeftRail` (Browse),
`StatusTab` (Status), or `CompactTimeline`, selected by `useCompactSurface()`. The
`BottomTabBar` picks the pane: Browse · Timeline · Status · Search (Search is momentary,
opening the palette). Status is therefore reachable only by an explicit tab tap — the
burial the ADR removes.

**F2 — The surface set is a tiny view-local store.** `compactSurface.ts` holds a single
primitive string (`"browse" | "timeline" | "status"`, plus the momentary `"search"`),
default `"browse"`, with `setCompactSurface` / `resetCompactSurface`. It is transient
device-level chrome — no wire, no scope-rekey. Collapsing Browse+Status into one
`"home"` pane is a change to this small type plus its handful of consumers
(`CompactAppShell`, `BottomTabBar`), nothing more.

**F3 — Both rails expect to FILL a flex parent — the real obstacle.** The compact
`LeftRail` returns `flex min-h-0 flex-1 flex-col` and `StatusTab` is likewise a
height-filling flex column; each assumes it owns its viewport height and scrolls its
own body. Stacked naively in one page scroll, two `min-h-0 flex-1` children collapse or
fight for height. The merge must wrap each rail as a NATURAL-HEIGHT (`shrink-0`) section
so the outer `<main>` is the single scroll container — the one integration-sensitive
part of the change. No engine, store, or wire work is implicated; it is pure layout.

**F4 — The fold primitive already exists and is shared.** `StatusTab` composes the
canonical `FoldSection` kit primitive (twisty + `SectionLabel` over a collapsible body,
no border/card), the SAME fold the left rail uses. The two new top-level STATUS /
BROWSE section headers reuse `FoldSection` (a sticky variant) — a missing primitive
would be a library gap to close, but here there is none: no bespoke header is authored
(design-system-is-centralized).

**F5 — The filter authority stays put.** The canonical corpus filter is authored in
`app/left/` and presented as a bottom sheet via the shared `filterSidebar` store; the
compact `LeftRail` already mounts `FilterSidebar` and the top bar's filter button opens
it. The unified rail keeps this exact wiring — it re-presents, never re-authors, the
filter (`filtering-has-one-canonical-surface` and its guard hold by construction).

**F6 — The tab bar and top bar are dumb chrome.** `BottomTabBar` takes `active` +
`onSelect` and holds no state; its tab list is a local `TABS` array roving through the
one `FocusZone`. Reducing it to Home · Timeline · Search is an edit to that array and
the `CompactSurface` union. `MobileTopBar`'s Browse-only actions (Search, Advanced
filters) and the workspace-switcher title trigger (mobile-enrichment D1) belong to the
unified Home pane after the merge — they follow the Browse content into `"home"`.

**F7 — Status content is fully served and projected.** `StatusTab` consumes stores
selectors exclusively (`usePipelineStatusView`, `usePlanInteriorView`, `useHistoryView`,
`usePRsView`, `useIssuesView`) over `/history`, `/prs`, `/issues`; nothing is fetched or
derived in chrome. Rendering it as a section instead of a pane changes zero data flow —
the wire-contract law (displayed state is backend-served) is satisfied unchanged.

**F8 — Section order is Status-first (decided).** Per the user direction captured in the
ADR, the unified scroll leads with the Status section (the critical glanceable state)
then Browse, each under a sticky collapsible header. This is the whole point: a long
vault tree must not push plan progress / PRs / issues / commits under the fold.
