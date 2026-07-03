---
tags:
  - '#audit'
  - '#global-state-review'
date: '2026-07-03'
modified: '2026-07-03'
related:
  - "[[2026-07-02-global-state-review-audit]]"
  - "[[2026-07-03-graph-implementation-review-audit]]"
---

# `global-state-review` audit: `cross-surface state agreement — rail, timeline, graph, context menus`

## Scope

User-directed cross-surface state-verification campaign (2026-07-03, reviewer-driven,
no subagents): do the left rail, timeline, and graph agree on their shared state, with
three reported symptoms — rail folder expand/collapse "double-fires", modes switchable
from multiple places with seemingly non-uniform state, and context-menu actions
"broken". Method: code audit of the state seams (`frontend/src/app/left/TreeBrowser.tsx`,
`frontend/src/stores/view/browserTreeExpansion.ts`,
`frontend/src/stores/server/graphViewModeBridge.ts`, `frontend/src/stores/view/browserMode.ts`,
the granularity/timeline mutation seams in `frontend/src/stores/server/dashboardState.ts`,
the context-menu resolvers in `frontend/src/app/stage/menus/` and `frontend/src/app/left/menus/`)
PLUS live headless verification against the canonical dev origin (Playwright +
SwiftShader): expand/collapse stickiness, menu-action end-to-end effects, and
cross-surface agreement screenshots. Finding IDs `GSR-###`.

## Findings

### GSR-001 | medium | follow-mode reveal re-asserted expansion on every tree refetch, fighting user collapses — FIXED

The rail's follow-mode reverse reaction (graph→rail: expand the selected node's parent
feature folder) ran as a state-derived effect keyed on `followMode`, `selectedNodeId`,
and the `nodeFeatureTags` map — and that map is REBUILT on every tree refetch (ambient
SSE vault edits, invalidations). Any refetch therefore re-ran the effect and re-expanded
a folder the user had just collapsed: the reported "expand/collapse double fires" —
collapse visually lands, then snaps back open. The reaction is now EVENT-gated on the
selection actually CHANGING (a consumed-per-node ref, reset when follow mode turns off,
consumed only on a successful expand so a tag that arrives late still reveals once).
Live-verified: with follow on, collapsing the selected feature folder sticks (immediately
and across a 3.5 s refetch window), a NEW selection still one-shot expands its folder,
and the collapsed folder stays collapsed while the new one opens.

### GSR-002 | info | rail default-disclosure "nondeterminism" explained — designed behavior, initial hypothesis rejected

Fresh loads sometimes showed the Features section open, sometimes collapsed. First
hypothesis (writers establishing a new expansion key without the default seed, a
first-writer race) was implemented and REJECTED by its own tests: the expansion store's
default seed is deliberately EMPTY (`defaultExpandedKeysForTreeKey` returns `[]` —
collapsed-start with the user's disclosure choices persisted is the documented
contract), so there is nothing to race. The real explanation: the SELECTION is
backend-persisted per scope, and the follow-mode reveal (GSR-001's reaction) expands
the selected feature's ancestors on load — so what looked like a nondeterministic rail
default was the rail correctly agreeing with server state that differed between runs.
Cross-surface agreement holds; no defect. The exploratory store change was reverted.

### GSR-003 | info | context menus verified WORKING end-to-end; the reported breakage reproduces as a transient dev-overlay deadening

Live-driven on the canonical origin: the rail feature menu and the canvas node menu
both open, close on Escape, and their verbs land cross-surface — "Focus on stage"
selects (rail row accent + graph cluster fence + spotlight), "Filter to this feature"
narrows the rail tree AND the graph AND stamps the filter chip in lock-step, node
"Open" opens the document dock tab with the node selected and labelled on canvas.
Disabled feature verbs on non-feature nodes are correctly disabled-with-reason. What
DID reproduce as "everything broken": a transient `vite-error-overlay` (an HMR compile
error from concurrent edits in this shared worktree) which intercepts ALL pointer
events until the error clears/reload — every menu and control reads as dead while it
is up. Environmental, not an app defect; when the UI seems globally inert, check for
the overlay first.

### GSR-004 | info | mode/state authority verified uniform across surfaces

Systematic pass over every shared-state plane the three surfaces consume: view mode
(rail Vault|Files toggle, keyboard cycle, command palette) all write the ONE
`browserMode` store, bridged once (`useGraphViewModeBridge`, mounted once at the shell)
convergently to `dashboardState.corpus` + the durable `graph_corpus` setting — no
second writer, no write-back loop. Graph granularity has a single writer (the stage
ViewSection through the stage-controls intent). Timeline mode has a single mutation
seam (`setTimelineMode`). Selection is the one canonical dashboard-state seam (prior
audit GS-001/002). Tree disclosure is one keyed, bounded, persisted store. The sim
run-state is one scene-truth mirror (GPR-001). Filters are the one authority record.
No non-uniformly-managed mode switch was found; the multi-entry switches all converge
on single seams by construction.

## Recommendations

- GSR-001 fixed in this pass; the reveal reactions (follow expand, GS-003 scroll) are
  now both event-consumed — keep any future cross-surface reaction on the same pattern
  (consume a change, never re-assert from identity-churned derived inputs).
- When the UI reads as globally dead during development, look for the vite error
  overlay before suspecting the action planes (GSR-003).
- No further action: the mode/authority matrix (GSR-004) is uniform, and the empirical
  cross-surface agreement checks (selection, filter, open, fence, tabs) all landed in
  lock-step during live verification.
