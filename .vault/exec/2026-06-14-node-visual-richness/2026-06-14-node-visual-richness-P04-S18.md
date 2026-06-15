---
tags:
  - '#exec'
  - '#node-visual-richness'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S18'
related:
  - "[[2026-06-14-node-visual-richness-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace node-visual-richness with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S18 and 2026-06-14-node-visual-richness-plan placeholders are machine-filled by
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
     The add card render and interaction tests for bloom, dwell, reduced-motion, and the three intents and ## Scope

- `frontend/src/app/islands/HoverCard.render.test.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# add card render and interaction tests for bloom, dwell, reduced-motion, and the three intents

## Scope

- `frontend/src/app/islands/HoverCard.render.test.tsx`

## Description

- Add a pure-logic host test covering the hover-id view slice (set/clear, identical-write short-circuit, distinctness from selection and the opened set), the dwell-then-suppress resolution, and the compact card projection (status via the scene util, the rollout channel only when progress is present, the id-title fallback and absent-status case).
- Add a render + interaction test exercising the host end to end through the REAL stores client transport (mockEngine) and a REAL scene controller seam — no component-internal doubles: the card does NOT mount before the dwell elapses; it mounts after the dwell and projects real node-detail content (the "accepted" status chip); it dismisses on hover-out; it is SUPPRESSED for an opened id; the open affordance fires the open intent (the node lands in openedIds); and a hover moving to a different node remounts a fresh card.
- The existing standalone card render test already covers the reduced-motion crossfade-without-transform-travel path and the bloom (transform) default; the new host tests cover the dwell, dismiss, suppression, and the three-intent separation.

## Outcome

The host's behavior is proven end to end against the real mock wire and the real seam: dwell gating, hover-out dismiss, open-suppression, the open intent, and the projection from node-detail. Fifteen new assertions across the two files pass, with the reduced-motion path covered by the pre-existing card render test.

## Notes

Real timers are used in the render test (not fake): the dwell rides a real setTimeout and the node-detail query resolves through the async mock transport, so `waitFor`'s polling and the dwell both settle naturally — fake timers would have deadlocked the query microtasks against `waitFor`. The plan named the standalone card render-test file as scope; the new host tests live in dedicated sibling test files (a pure-logic `*.test.ts` and a render `*.render.test.tsx`) beside the host, additive to the existing card test.
