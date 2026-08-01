---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:cf12959e5c50e14f6fdd4fb3b5fe5b8da74bac99ddcf7106f703907eedf92b87'
step_id: 'S21'
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
     The S21 and 2026-08-01-approval-shape-reconciliation-plan placeholders are machine-filled by
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
     The Extend the exhaustive ApprovalRequirement coverage test to include the new reviewer approval required token and ## Scope

- `frontend/src/stores/server/authoring/reviewStationVocabulary.test.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Extend the exhaustive ApprovalRequirement coverage test to include the new reviewer approval required token

## Scope

- `frontend/src/stores/server/authoring/reviewStationVocabulary.test.ts`

## Description

- Add `"reviewer_approval_required"` to the `requirements` fixture array in `reviewStationVocabulary.test.ts`, alongside the exhaustive `ApprovalRequirement` coverage loop over all three modes.
- Update the unique-descriptor-key assertion from 6 to 9 (3 modes x 3 requirements, every combo resolving a distinct catalog key).

## Outcome

The exhaustive coverage test iterates all 9 mode/requirement combinations and asserts 9 distinct, fully-translated descriptor keys with no fallback. `npx vitest run src/stores/server/authoring/reviewStationVocabulary.test.ts` passes (10/10); `npx eslint` is clean on every file this Phase touched. `npx tsc --noEmit` shows no NEW errors attributable to this Phase's files — the pre-existing errors it reports (`ControlPanels`, `FrameworkStatusCluster`, `controlPanels` store, etc.) belong to other concurrently in-flight lanes in this shared tree, unrelated to `ApprovalRequirement`/policy vocabulary.

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
