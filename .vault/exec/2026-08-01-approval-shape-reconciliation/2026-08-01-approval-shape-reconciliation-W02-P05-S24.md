---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:2aaf77c6987f38e5e0c39fa22cdbfcc3445f58ef28498b3ba12431b17472b82b'
step_id: 'S24'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace approval-shape-reconciliation with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S24 and 2026-08-01-approval-shape-reconciliation-plan placeholders are machine-filled by
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
     The Remove the session_override and session_override_ignored fixture lines from the authoring store test and ## Scope

- `frontend/src/stores/server/authoring.test.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Remove the session_override and session_override_ignored fixture lines from the authoring store test

## Scope

- `frontend/src/stores/server/authoring.test.ts`

## Description

- Remove the three `session_override`/`session_override_ignored` fixture lines from `authoring.test.ts` (the shared `needsReviewProjectionWire()` fixture, the `adaptProposalProjection` expectation it feeds, and the applied-under-policy lane's nested policy fixture in `adaptProposalList`).

## Outcome

`npx vitest run src/stores/server/authoring.test.ts src/app/authoring/ReviewStation.render.test.tsx` passes 63/63. A mechanically-required follow-on beyond the plan's named scope: `frontend/dev/visual-review/specimens/authoring.tsx` (the visual-review desk's authored `proposalRow` fixture, sanctioned under the dev/production fence exception) also constructs a `PolicyDecisionProjection` literal and failed `tsc` once the field left the type; its one `session_override_ignored` line is removed too, keeping the desk fixture on the same served shape as the real wire.

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
