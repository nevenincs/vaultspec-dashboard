---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:6a1cafb9a55ab55c4abc34eb46a08cc1cd94737ff0068ed4998c2c8941695fe0'
step_id: 'S20'
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
     The S20 and 2026-08-01-approval-shape-reconciliation-plan placeholders are machine-filled by
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
     The Add the three reviewer approval policy copy strings and reword the manual human approval string off its former reviewer approval phrasing and ## Scope

- `frontend/src/locales/en/documents.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the three reviewer approval policy copy strings and reword the manual human approval string off its former reviewer approval phrasing

## Scope

- `frontend/src/locales/en/documents.ts`

## Description

- Add three new policy copy strings: `assistedReviewerApproval`, `autonomousReviewerApproval`, `manualReviewerApproval` (the two unreachable non-manual combos reuse the same "reviewer approval" phrasing as their sibling mode for consistency; the manual entry reuses the exact string `manualHumanApproval` previously held).
- Reword `manualHumanApproval` off its former "Manual, reviewer approval" phrasing to "Manual, human approval required", matching the engine's `decision_reason` destructive-floor wording ("requires explicit human approval") now that this token exclusively denotes the destructive floor.
- Extend `frontend/src/localization/catalogKeys.test.ts` and `frontend/src/localization/messagePolicy.ts` with the three new keys (both are hand-maintained exhaustive registries over every catalog key, enforced by existing tests; not in the plan Step's named scope but mechanically required to keep `messagePolicy.test.ts` and `catalogKeys.test.ts` green after the catalog addition).

## Outcome

Three new `documents:reviewStation.policy.*ReviewerApproval` keys are live with `role: "label"` policy entries; `manualHumanApproval` reads "Manual, human approval required", distinct from the new `manualReviewerApproval`'s "Manual, reviewer approval".

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
