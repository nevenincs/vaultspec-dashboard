---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S29'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Seed the agent tier on every response so absence can no longer masquerade as A2A availability

## Scope

- `engine/crates/engine-query/src/envelope.rs`

## Description

- Seeded a dedicated `agent` tier in engine-query `tiers_block`, DEGRADED-honest by default (available false with an unresolved reason) so absence can never masquerade as availability.
- Overlaid the REAL product-controller classification in the api `tiers_value` funnel - the one place all three tiers builders and every api error pass through - flipping `agent` to available when a usable gateway is live, or replacing the reason with the truthful one; an explicit `agent` degradation from a caller is authoritative and never overwritten.
- Resolved the agent state machine-globally (scope-independent) via the product paths, matching the seated plane's home.

## Outcome

The agent tier is present on every response with honest state. Frontend behavior unchanged (the tolerant reader still maps present-false to down, present-true to up). engine-query tests (151, incl. two new agent-tier assertions) and the api lib suite (870) pass; no existing tiers-length or agent-absence assertion regressed. Build/clippy/fmt green.

## Notes

The frontend tolerant reader can now collapse to the canonical tier read, but per the task that behavior change is out of scope here and was left untouched.
