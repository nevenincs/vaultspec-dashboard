---
tags:
  - '#audit'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:8b7b07399d136645d43b5ed5e1cc345257b0d839aea90485461aacfeed851c3d'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
  - "[[2026-09-05-design-system-consolidation-adr]]"
  - "[[2026-09-05-design-system-consolidation-horizontal-polish-research]]"
  - "[[2026-09-05-design-system-consolidation-shipped-frontend-blueprint-reference]]"
---

# `design-system-consolidation` audit: `S175 palette and agent relative-value classification review`

## Scope

Reviewed exact Step `W01.P01.S175`: every raw relative-value line-site under `app/palette` and `app/agent`, the nine appended ledger identities, complete compound expressions and units, dispositions, canonical owners, and rationale fields against the accepted behavior-preserving consolidation decision and live source. Later value families and unrelated dirty graph and scene work remained outside scope.

The independent raw scan reproduced exactly 106 production app/platform line-sites and exactly nine disjoint S175 scope line-sites. The accepted prefixes remain S172 at 18, S173 at 14, and S174 at 24; the accumulated ledger imports as 65 entries. S175 has nine unique collision-safe source identities, no missing source-expression fragment, and the exact split of six `migrate`, three `retain-exact-geometry`, and zero repairs.

The focused `consolidation-ledger.test.ts` suite passed three of three tests. Independent `just lint frontend` exited 0 across ESLint, localization, relative-unit, domain, module-size, formatting, typecheck, token-drift, and Figma-name checks.

## Findings

### s175-palette-agent-relative-value-classification | low | The palette and agent slice is exhaustive and value-preserving

No corrective finding surfaced. `DocumentSearchSurface`, `CommandPaletteSurface`, and both populated and empty `SearchPaletteSurface` regions record their complete shipped viewport expressions and point to exact planned component roles consumed by the W06 overlay and search-palette steps. `AgentTag` reuses the exact planned `0.025rem` eyebrow-tracking role already established by S172. No migration snaps a value or promotes singular geometry without a concrete component owner.

The retained `SearchResultPill` `0.09375rem` border is a layout-stable selection silhouette with no shared stroke contract; Composer's `6.75rem` cap belongs to its specialized expanding entry seam; and `UserTurnBubble`'s `85%` line-length cap is adaptive conversation geometry rather than a global container role. Scoped status shows no S175 palette, agent, production, or scene edit.

## Recommendations

- Preserve all nine compound line-site identities through S178's complete 106-site verification.
- When W06 defines the planned viewport tokens, share or alias the exact `32rem` nominal width and `calc(100vw - 2rem)` compact guard used by command and document-search overlays instead of emitting duplicate leaf authorities.

Status: PASS.
