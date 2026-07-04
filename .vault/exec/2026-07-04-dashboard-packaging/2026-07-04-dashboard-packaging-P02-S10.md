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
- Expose the handshake through the ONE degradation reader (`readTierAvailability`) as an advisory `components` map on `TierAvailability` - deliberately NOT folded into `degraded` (review revision): a below-floor core still reads fine, and the engine's own served eligibility is what blocks the authoring verbs it cannot honor, so the client never invents a whole-tier degradation over working read surfaces
- Add `engine.tierComponent.test.ts`: a below-floor component is exposed but never degrades an available tier, component data rides along on a degraded tier with the engine reason intact, rag's honestly-null version is preserved, and a component-less block behaves exactly as before

## Outcome

The four reader tests pass, `tsc -b` and the full `just dev lint frontend` gate exit 0, and the full frontend suite passed (2648 tests; one pre-existing unrelated stale wire assertion fixed separately). The conformance suite is unaffected (presence-based tiers assertions).

## Notes

- First landing folded `meets_floor: false` into `degraded`; the P02 review correctly flagged that as broader than the ADR (D6 blocks AUTHORING on a stale core - reads keep working on old verbs) and it was revised to the advisory exposure recorded above. Authoring blocking remains the engine's served eligibility, which the capability probe already degrades on a stale core.
