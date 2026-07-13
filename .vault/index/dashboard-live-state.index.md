---
generated: true
tags:
  - '#index'
  - '#dashboard-live-state'
date: '2026-06-13'
modified: '2026-07-12'
related:
  - '[[2026-06-13-dashboard-live-state-P01-S01]]'
  - '[[2026-06-13-dashboard-live-state-P01-S02]]'
  - '[[2026-06-13-dashboard-live-state-P02-S03]]'
  - '[[2026-06-13-dashboard-live-state-P02-S04]]'
  - '[[2026-06-13-dashboard-live-state-P02-S05]]'
  - '[[2026-06-13-dashboard-live-state-P02-S06]]'
  - '[[2026-06-13-dashboard-live-state-P02-S07]]'
  - '[[2026-06-13-dashboard-live-state-P03-S08]]'
  - '[[2026-06-13-dashboard-live-state-P03-S09]]'
  - '[[2026-06-13-dashboard-live-state-adr]]'
  - '[[2026-06-13-dashboard-live-state-audit]]'
  - '[[2026-06-13-dashboard-live-state-plan]]'
  - '[[2026-06-13-dashboard-live-state-research]]'
---

# `dashboard-live-state` feature index

Auto-generated index of all documents tagged with `#dashboard-live-state`.

## Documents

### adr

- `2026-06-13-dashboard-live-state-adr` - `dashboard-live-state` adr: `live and degradation state plane` | (**status:** `accepted`)

### audit

- `2026-06-13-dashboard-live-state-audit` - `dashboard-live-state` audit: `live and degradation state plane`

### exec

- `2026-06-13-dashboard-live-state-P01-S01` - Add the scope-keyed live-connection slice holding streamConnected, lastSeq, and brokenLinkCount
- `2026-06-13-dashboard-live-state-P01-S02` - Throw StreamLostError on an abnormal stream close or non-ok response in the SSE consumer
- `2026-06-13-dashboard-live-state-P02-S03` - Implement the graph-sync hook: subscribe the live graph channel, invalidate the constellation, track connection and lastSeq
- `2026-06-13-dashboard-live-state-P02-S04` - Extend deriveInputs to read injected live signals for streamLost and brokenLinkCount, keeping it pure
- `2026-06-13-dashboard-live-state-P02-S05` - Compose the live-connection slice into the surface-states hook
- `2026-06-13-dashboard-live-state-P02-S06` - Bind setDegradationHandler in app bootstrap so a stream-lost classification flips streamConnected false
- `2026-06-13-dashboard-live-state-P02-S07` - Mount the graph-sync hook and push the held slice broken-link count from the Stage
- `2026-06-13-dashboard-live-state-P03-S08` - Add the live e2e for the stream-lost degraded surface and live reactivity
- `2026-06-13-dashboard-live-state-P03-S09` - Run typecheck, lint, test, build, and vault check green and record the verification

### plan

- `2026-06-13-dashboard-live-state-plan` - `dashboard-live-state` plan

### research

- `2026-06-13-dashboard-live-state-research` - `dashboard-live-state` research: `live and degradation state plane`
