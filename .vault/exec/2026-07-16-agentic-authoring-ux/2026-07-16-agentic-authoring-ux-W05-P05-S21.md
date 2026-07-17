---
tags:
  - '#exec'
  - '#agentic-authoring-ux'
date: '2026-07-16'
modified: '2026-07-17'
step_id: 'S21'
related:
  - "[[2026-07-16-agentic-authoring-ux-plan]]"
---

# Wire the Team selector to the a2a presets-list pass-through and team run-start/status/cancel, degraded disabled-with-reason from tiers when a2a is down (D9)

## Scope

- `frontend/src/stores/server/agent`

## Description

- Added `A2aTeamClient` (`frontend/src/stores/server/agent/a2aTeam.ts`) as the sole
  wire client for the `/ops/a2a` pass-through: `presetsList`, `runStart`, `runStatus`,
  `cancelRun`, and `openRunStream`, each going through the one `passThrough`/
  `baseFetch` seam so no caller reaches the engine directly.
- Presets, run-start, and run-status all read degradation from the served `tiers`
  block (wire-contract rule): when the a2a sibling is down, the Team selector renders
  disabled-with-reason from that tiers truth rather than inferring offline from a
  transport error or timeout.
- Bounded query caches under `a2aKeys` (`presets`, `serviceState`, `runStatus(runId)`,
  `runRelay(runId)`) — no unbounded accumulator.

## Outcome

The Team selector is wired end to end to the a2a presets-list pass-through and the
team run lifecycle (start/status/cancel), degrading honestly from `tiers` when a2a is
unreachable.

## Notes

Landed at commit `dcdcfaa83d` ("Team selector over /ops/a2a + per-run relay
consumption with polling fallback"). Reviewer-verified: scoped `tsc`/`eslint`/
`prettier` clean, 18 unit tests (`a2aTeam.test.ts`) + 2 live tests
(`a2aTeam.live.test.ts`) — independently reconfirmed live, 20/20 passing. Full review
verdict and the six confirmed focus items are recorded in the W05 section of
`2026-07-16-agentic-authoring-ux-audit.md`. This record was authored during a
persistence pass alongside the review, not the review itself.
