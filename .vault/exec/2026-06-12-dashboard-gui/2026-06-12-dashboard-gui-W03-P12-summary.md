---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
related:
  - '[[2026-06-12-dashboard-gui-plan]]'
---

# `dashboard-gui` `W03.P12` summary

Phase W03.P12 (degradation, visual language, live integration) is
complete: all five Steps closed - and with them every Step of the plan
(S01-S50). Frontend quality gates green at the boundary: typecheck,
eslint, vitest 226 passed across 46 files, prettier, production build,
and the e2e smoke 3 passed + 1 flagged against the live origin.

- Created: `frontend/src/app/degradation/` (matrix + debug switch + hook,
  tests), `frontend/src/app/a11y/` (keyboard nav + contrast test),
  `frontend/src/stores/server/liveAdapters.ts` (+ tests),
  `frontend/e2e/smoke.spec.ts`, `frontend/playwright.config.ts`
- Modified: `frontend/src/styles.css` (token layer),
  `frontend/vite.config.ts` (DF-6 dev auth), `frontend/src/stores/server/engine.ts`
  (token transport + adapters), shell/stage/timeline wiring

## Description

- S46: the ADR §8 degradation matrix encoded pure with row-by-row tests
  and a dev debug switch; REVISED per finding 035 - no-vault and
  date-mandate degrade the mock's SERVED data end-to-end, stream-lost
  declared plainly as a transport-condition UI overlay (re-check pending).
- S47: the design-token layer in Tailwind CSS-first config - paper-warm
  light + dark as a variable remap, fixed tier hues with treatment
  primary, motion band, reduced-motion floor; the stale token darkened
  after the automated contrast check (038) caught it under the 3:1 floor.
- S48: keyboard operability (arrow-walk, constellation cycling,
  bracket-step with LIVE transitions) and two-layer reduced motion; plus
  the 038 rider set - palette focus trap/restore, arrow-walk live region,
  WCAG contrast test backing the AA claim.
- S49: the live-origin swap - DF-6 token bootstrap verified end-to-end
  (proxy-injected bearer in dev, meta-tag transport in prod), tolerant
  sample-tested live adapters keeping one client path over both origins,
  and SIX capability divergences flagged to the engine owners, never
  absorbed (asof/diff timestamp parsing, missing constellation synthesis,
  null node titles, no git block, dateless tree, nested search envelope
  with an empty rag index).
- S50: the e2e smoke against live `vaultspec serve` - shell + token,
  constellation render, and search round-trip PASS; the scrub leg is
  test.fixme-flagged on the asof/diff divergence as an external
  dependency.

Open at plan completion, all flagged and owned: the 035 re-check
(experience-architect), the engine-side contract reconciliation set
(divergence items 1-6, routed by team-lead), the live scrub smoke leg
(un-fixme on item 1), and the commissioned glyph family swap behind the
provider seam (G7.c, design work in flight).
