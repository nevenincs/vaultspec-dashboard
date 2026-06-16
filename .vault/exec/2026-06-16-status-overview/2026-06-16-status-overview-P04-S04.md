---
tags:
  - '#exec'
  - '#status-overview'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S04'
related:
  - "[[2026-06-16-status-overview-plan]]"
---




# Component tests (anchor, expansion, commits, open-in-viewer, themes), full lint gate, code review

## Scope

- `frontend/src/app/right/StatusTab.render.test.tsx`

## Description

- Add the StatusTab render test exercising all three sections through the real mock client transport: the location anchor (path, branch, main marker), open-plans list (progress/tier/phase), step-tree expansion showing open steps, open-in-viewer firing on a plan row (markdown surface + selection), the tiers-driven degraded state, and the recent-commit list + commit cross-link.
- Add a theme-parity case (light/dark/high-contrast) asserting identical structural DOM and no inline raw hex.
- Update the rail IA tests (RailTabs render + rail.test) for the refined Status / Inspect / Search / Changes set.
- Run the full gates: engine `cargo fmt --check` + `cargo clippy --workspace --all-targets` exit 0; frontend `just dev lint frontend` exit 0 (eslint+prettier+tsc+token-drift+figma-registry, after syncing the figma component registry for the 3 new exports).
- Run the full frontend vitest suite (1324 passed) and the touched engine crate tests (all pass).
- Perform the code review (executor adopting the reviewer discipline; Task dispatch unavailable this session) and author the audit: verdict PASS, two LOW follow-ups.

## Outcome

Code review verdict PASS (no Critical/High). All gates green. Component tests cover anchor render, open-plans expansion → open steps, recent commits render, open-in-viewer on a plan row, and theme parity across light/dark/HC. The audit records one codification candidate (`open-work-is-read-from-plan-steps-not-graph-density`), left unpromoted per the first-encounter rule.

## Notes

LOW-1: `/history` (and the existing `content.rs`) echo gix substrate-read error strings verbatim into the `error` field; a shared sanitizer is a future follow-up. LOW-2: `WorkTab` stays in the tree as the home of the reused `PlanStepTree`/`ProgressRing` exports though it is no longer mounted as a tab. The Figma screenshot read tool was unavailable; the UI was replicated from the ADR contract + the established design-system token classes the existing rail surfaces bind.
