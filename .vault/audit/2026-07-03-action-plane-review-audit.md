---
tags:
  - '#audit'
  - '#action-plane-review'
date: '2026-07-03'
modified: '2026-07-03'
related:
  - "[[2026-07-03-view-store-review-audit]]"
  - "[[2026-07-03-global-state-review-audit]]"
---

# `action-plane-review` audit: `actions, keymap, palette, and context-menu action plane`

## Scope

Campaign continuation (2026-07-03, reviewer-driven, no subagents), with the user's
reported symptom as the hunting brief: "a lot of actions do not operate TanStack
states, graph controls, UI elements". Reviewed: the dispatch seams
(`stores/view/menuActions.ts`, `chromeActions.ts`, `graphCommands.ts`), the per-kind
context-menu resolvers (`app/stage/menus/graphNodeMenu.ts`, `canvasMenu.ts`, the rail
menus), the shared feature verbs (`app/menus/sharedActions.ts`), the execution host
(`app/menu/ContextMenuHost.tsx` activation path), the palette provider surface
(`commandPaletteCommands.ts`), the keymap dispatcher and its global-listener
exclusivity, plus the plane's guard suites — and a two-part LIVE battery driving ~15
verbs across all four planes on the canonical dev origin with observable state
assertions. Finding IDs `APR-###`.

## Findings

### APR-001 | info | the reported symptom does not reproduce — every probed action operates its canonical seam

The live batteries asserted effects, not just dispatch: palette `Timeline: Last 7
days` fired a real `PATCH /dashboard-state {date_range: 2026-06-26..2026-07-03}`
observed on the wire AND moved the timeline readout (12 Jun–3 Jul → 26 Jun–3 Jul);
`Clear date range` restored it — the exact "operate TanStack state" class the
symptom names, working end-to-end. `Graph: Hide`/`Graph: Show` from the palette
removed/restored the canvas host; `Ctrl+K` (keymap) opened the palette; `?` opened
the shortcuts legend; the background canvas menu's follow-mode toggle flipped real
state (its own label round-tripped); `Refresh data` fired a genuine engine GET
burst; the rail feature menu's `Focus on stage` / `Filter to this feature` /
`Expand feature` and the node menu's `Open` all landed cross-surface (verified in
this and the prior global-state audit: selection accent + cluster fence, rail+graph
narrowing in lock-step, dock tab open). Zero page errors across the batteries. The
most probable source of the reported experience remains the transient
`vite-error-overlay` documented in the global-state audit (GSR-003), which deadens
every pointer/keyboard interaction while an HMR compile error is up — every plane
reads as "not operating" until reload.

### APR-002 | info | plane structure verified against the codified rule — one descriptor, canonical seams, derived accelerators

- The dispatch seams route exclusively to canonical planes: `menuActions` →
  `selectNode` (backend selection) / `activateEntity` (the one open seam) /
  pins/working-set stores (correct view-local planes); `graphCommands` → the
  scene-command bridge plus chrome-store writes (freeze writes BOTH, correctly);
  ops verbs ride the `dispatch` path whose outcome consumer branches the refusal
  envelope, invalidates the cache on success, and announces feedback (KAR-004/006
  discipline, visible in `ContextMenuHost`).
- Shared verbs are authored once and composed (`sharedActions`, `chromeActions`
  builders with state-reading labels); accelerators derive from the keymap registry
  (`withAccelerator` → `effectiveChord`), never hand-typed.
- The activation host degrades honestly: arm-to-confirm for destructive verbs,
  logged (not thrown) missing-dispatch, cursor/arm repair against a re-derived item
  set.
- Global-keydown exclusivity holds: the repo has exactly three `keydown` listeners —
  the ONE keymap dispatcher, the Class-B `useDismissOnEscape` widget primitive
  (sanctioned by the rule), and the settings chord RECORDER, which attaches only
  while actively recording and uses capture phase precisely so the chord being
  recorded cannot execute through the dispatcher — the legitimate modal exception.
- Guard + unit suites for the plane: 189 tests green (actionCoverage,
  commandPalette guard, backgroundContextMenu, chromeActions, keymapDispatcher,
  platform actions/keymap).

### APR-003 | info | disabled feature verbs on document nodes render label-only rows

Observed in the first battery: the node menu's disabled `Autofix feature` /
`Archive feature` rows (a document node derives no feature tag) expose their
disabled-with-reason only via ARIA/`title`, so the visible row reads as a bare
label. Correct per the descriptor contract and screen-reader honest; recorded as a
possible polish item (inline reason text) for the design plane, not an action-plane
defect.

## Recommendations

- No remediation required — third consecutive layer to close clean. When "nothing
  responds" is reported during development, check for the vite error overlay first
  (GSR-003/APR-001).
- If the inline disabled-reason polish (APR-003) is wanted, it is a ContextMenu row
  presentation change, not a descriptor change.
