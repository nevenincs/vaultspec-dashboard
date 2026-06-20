---
tags:
  - '#exec'
  - '#temporal-graph-layout'
date: '2026-06-18'
modified: '2026-06-18'
step_id: 'S21'
related:
  - "[[2026-06-17-temporal-graph-layout-plan]]"
---

# verify in browser that a dense same-day slice shows individual clustered nodes on the Cosmos surface

## Scope

- `frontend browser verification`

## Description

- Start a forced Vite verification server on port 5176 to avoid the stale dependency cache on the existing 5175 server.
- Use Playwright CLI to wait for the temporal Cosmos canvas selector.
- Capture a 1440 by 900 screenshot of the live Timeline surface after the edge-cap change.
- Inspect the screenshot for dense individual nodes, auxiliary bucket guides, and bounded debug output.

## Outcome

Browser verification passed. The captured screenshot shows the Timeline skeleton with the Cosmos canvas mounted, a dense cluster of individual document nodes, visible day bucket guide cues, and temporal debug output reporting static temporal mode, 1000 nodes, 1305 edges, 6 buckets, and the densest day count.

Screenshot artifact: `output/playwright/temporal-cosmos-canvas-final.png`.

## Notes

The screenshot also confirms that edge capping is active in the live interface after the earlier unbounded-edge finding.
