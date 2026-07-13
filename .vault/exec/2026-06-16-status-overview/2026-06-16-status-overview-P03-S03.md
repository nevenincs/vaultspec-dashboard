---
tags:
  - '#exec'
  - '#status-overview'
date: '2026-06-16'
modified: '2026-07-12'
step_id: 'S03'
related:
  - "[[2026-06-16-status-overview-plan]]"
---

# Build StatusTab (location anchor + open plans w/ step-tree expand + open-in-viewer + recent commits), wire into rail IA

## Scope

- `frontend/src/app/right/StatusTab.tsx`

## Description

- Add a `useLocationAnchor` / `deriveLocationAnchor` stores selector composing the active scope, the workspace map (worktree branch + is_main, matched on path or id), and the git rollup (branch/dirty/ahead/behind) into one interpreted view, so the dumb tab reads a single selector and never iterates the raw map or reads the raw tiers block.
- Export `PlanStepTree` and `ProgressRing` from the Work surface so the Status tab reuses the established step-tree dropdown and progress carrier rather than inventing new disclosure UI.
- Build the dumb `StatusTab` (under `app/right/`) with three sections: the location anchor header ("Where are we?"), the plan-derived open-work list with the reused step-tree expand + a plan row that opens the plan document in the markdown reader via `openInViewer` ("What is being worked on?"), and the recent-commit list cross-linking touched nodes ("What has been committed?"). No connections section (ADR non-goal). Degradation reads from tiers.
- Refine the rail IA: make Status the primary tab and fold the Work pillar into it; the refined tab set is Status / Inspect / Search / Changes (the four-tab law honored, Changes/Search kept). Update RailTabs, AppShell default tab + render, and the rail IA + RailTabs render tests.

## Outcome

The Status overview is the rail's primary surface, composed of existing projections plus the one new history query, all read through stores selectors. Theme entirely from `--color-*` tokens. tsc clean.

## Notes

The Figma screenshot read tool was unavailable this session; the layout/hierarchy was replicated from the ADR contract and the established design-system token classes the existing rail surfaces (WorkTab, ChangesOverview, NowStrip) already bind to the Figma ActivityRail. The `WorkTab` component remains in the tree as the home of the reused exports; it is no longer mounted as a tab.
