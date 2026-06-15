---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S64'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---




# Make arcs reachable from their endpoints, announcing the relation and endpoints

## Scope

- `frontend/src/app/timeline/arcs.ts`

## Description

- Verified arcs are reachable from their endpoints: the arc group is `aria-hidden` decorative paint, while each endpoint mark appends incident-relation phrases built from the arc-endpoint-label helper (relation plus joined endpoint, direction-aware), so an arc relation and endpoints are announced without the arc becoming its own tab-stop.

## Outcome

Arc relation + endpoints announced from the endpoint marks; arcs themselves are aria-hidden, no extra tab-stops. Satisfied by the prior partial run; assessed and confirmed.

## Notes

Source satisfied by the prior partial run. This run confirmed the S64 render test (a mark names an incident relation + endpoint, arcs group is aria-hidden) and the pure arc-endpoint-label direction test.
