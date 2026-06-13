---
generated: true
tags:
  - '#index'
  - '#dashboard-platform'
date: '2026-06-13'
modified: '2026-06-13'
related:
  - '[[2026-06-13-dashboard-platform-P01-S01]]'
  - '[[2026-06-13-dashboard-platform-P01-S02]]'
  - '[[2026-06-13-dashboard-platform-P01-S03]]'
  - '[[2026-06-13-dashboard-platform-P02-S04]]'
  - '[[2026-06-13-dashboard-platform-P02-S05]]'
  - '[[2026-06-13-dashboard-platform-P02-S06]]'
  - '[[2026-06-13-dashboard-platform-P02-S07]]'
  - '[[2026-06-13-dashboard-platform-P03-S08]]'
  - '[[2026-06-13-dashboard-platform-P03-S09]]'
  - '[[2026-06-13-dashboard-platform-P03-S10]]'
  - '[[2026-06-13-dashboard-platform-P04-S11]]'
  - '[[2026-06-13-dashboard-platform-P04-S12]]'
  - '[[2026-06-13-dashboard-platform-P05-S13]]'
  - '[[2026-06-13-dashboard-platform-P05-S14]]'
  - '[[2026-06-13-dashboard-platform-adr]]'
  - '[[2026-06-13-dashboard-platform-plan]]'
  - '[[2026-06-13-dashboard-platform-research]]'
---

# `dashboard-platform` feature index

Auto-generated index of all documents tagged with `#dashboard-platform`.

## Documents

### adr

- `2026-06-13-dashboard-platform-adr` - `dashboard-platform` adr: `frontend runtime substrate` | (**status:** `accepted`)

### exec

- `2026-06-13-dashboard-platform-P01-S01` - Implement the leveled, namespaced ring-buffer logger with a pluggable sink array
- `2026-06-13-dashboard-platform-P01-S02` - Install the global window.onerror and unhandledrejection traps routed to the logger
- `2026-06-13-dashboard-platform-P01-S03` - Bridge scene-worker logs to the main logger and migrate the two worker console calls
- `2026-06-13-dashboard-platform-P02-S04` - Implement the ErrorBoundary class with app and region variants, reset, and the logger hook
- `2026-06-13-dashboard-platform-P02-S05` - Mount the app-level boundary as the last line in the app root
- `2026-06-13-dashboard-platform-P02-S06` - Wrap the four AppShell regions in region boundaries with designed fallbacks
- `2026-06-13-dashboard-platform-P02-S07` - Add the dev-only crash-injection affordance for adverse-condition testing
- `2026-06-13-dashboard-platform-P03-S08` - Implement the typed Action and dispatch core with the middleware chain
- `2026-06-13-dashboard-platform-P03-S09` - Implement the logging, tracing, and arm-to-confirm guard middlewares
- `2026-06-13-dashboard-platform-P03-S10` - Implement the useAction React hook face over the dispatch core
- `2026-06-13-dashboard-platform-P04-S11` - Implement the FailureKind taxonomy, classifyError, and the failure-policy hook with an injected degradation mapper
- `2026-06-13-dashboard-platform-P04-S12` - Publish the platform public API barrel and wire the query client error sink to the policy
- `2026-06-13-dashboard-platform-P05-S13` - Add the live adverse-condition spec exercising each FailureKind through the boundaries and policy
- `2026-06-13-dashboard-platform-P05-S14` - Run typecheck, lint, test, build, and vault check green and record the verification

### plan

- `2026-06-13-dashboard-platform-plan` - `dashboard-platform` plan

### research

- `2026-06-13-dashboard-platform-research` - `dashboard-platform` research: `frontend runtime substrate`
