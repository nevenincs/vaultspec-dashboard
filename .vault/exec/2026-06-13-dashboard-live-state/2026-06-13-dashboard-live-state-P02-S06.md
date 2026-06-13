---
tags:
  - '#exec'
  - '#dashboard-live-state'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S06'
related:
  - "[[2026-06-13-dashboard-live-state-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-live-state with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.
     step_id is the originating Step's canonical identifier, e.g. S01.
     The S06 and 2026-06-13-dashboard-live-state-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Bind setDegradationHandler in app bootstrap so a stream-lost classification flips streamConnected false and ## Scope

- `frontend/src/main.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Bind setDegradationHandler in app bootstrap so a stream-lost classification flips streamConnected false

## Scope

- `frontend/src/main.tsx`

## Description

- Bound `failurePolicy.setDegradationHandler` in app bootstrap (ADR D5): a
  `stream-lost`-signalled `degraded` classification flips the live-connection slice's
  `streamConnected` to false, so the degradation matrix renders the reconnecting/stale
  surface. This is the platform-policy adoption the platform audit assigned to the Data
  team - the policy classifies (mechanism), the live signal is the vocabulary binding.
- Exposed `useLiveStatusStore` on `globalThis` in dev (alongside the existing ring
  buffer) so the adverse e2e can drive the live signal; never exposed in production.

## Outcome

The classify -> surface loop closes without the stores importing the policy's
vocabulary: a real `StreamLostError` (thrown by `sseChunks`, classified by the policy)
now reaches the degradation surface. The full suite stays green.

## Notes

The dev-only global exposure is gated on `import.meta.env.DEV`; the production bundle
carries neither global. No scaffolds in shipped paths.
