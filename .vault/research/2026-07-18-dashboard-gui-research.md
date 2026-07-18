---
tags:
  - '#research'
  - '#dashboard-gui'
date: '2026-07-18'
modified: '2026-07-18'
related: []
---

# `dashboard-gui` research: `s20-bridge-proof`

## Findings

## Context

# S20 bridge proof

## Overview

Research note documenting the bridge implementation for S20: TanStack Query integration between engine wire and frontend stores.

## Context

S20 (`dashboard-gui` W02.P05.S20) wired TanStack Query as the data-fetching bridge between the engine's HTTP wire and frontend stores.

## Key Implementation Points

### Query Key Factory
- Keys carry scope and filter context
- Enables cache invalidation and refetch coordination

### SSE Integration
- `streamUrl` with `since=` splice resume
- Delta clock for live updates

### Store Integration
- Single source of truth for wire client state
- Degradation handling via `tiers` block

## References

- `.vault/exec/2026-06-12-dashboard-gui/2026-06-12-dashboard-gui-W02-P05-S20.md`
- `.vault/exec/2026-06-12-dashboard-gui/2026-06-12-dashboard-gui-W02-P05-summary.md`
