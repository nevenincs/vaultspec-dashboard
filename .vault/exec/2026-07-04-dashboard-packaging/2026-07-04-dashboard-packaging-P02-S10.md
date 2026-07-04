---
tags:
  - '#exec'
  - '#dashboard-packaging'
date: '2026-07-04'
modified: '2026-07-04'
step_id: 'S10'
related:
  - "[[2026-07-04-dashboard-packaging-plan]]"
---

# consume the handshake fields through the existing stores tiers reader so stale-core blocks authoring verbs and absent rag greys semantic panels

## Scope

- `frontend/src/stores/server`

## Description

- Extend `TiersBlock` with the served, optional per-tier `component` handshake (`TierComponent`: name, floor, version, meets_floor)
- Fold the served `meets_floor: false` verdict into the ONE degradation reader (`readTierAvailability`): a below-floor component degrades its tier even when nominally available, so all twenty-plus consuming surfaces (authoring eligibility on `declared`, semantic panels on `semantic`) block or grey automatically
- The engine-served reason always wins; only when the engine supplied no reason does the client word a presentation label from the served fields ("vaultspec-core 0.1.34 is older than the supported version 0.1.36")
- Add `engine.tierComponent.test.ts`: below-floor degrades with the worded reason, floor-met stays healthy, an unknown (null) verdict never degrades on its own, the served reason wins, and a component-less block behaves exactly as before

## Outcome

The five new tests pass; the full frontend suite passes (2648 tests, one pre-existing unrelated failure fixed separately in the stale target-to-type wire assertion); `just dev lint frontend` exits 0. The conformance suite is unaffected (presence-based tiers assertions).

## Notes

- No surface reads the raw block; the verdict is engine-served and the client only words the label, per the wire-contract rule that displayed state is backend-served.
