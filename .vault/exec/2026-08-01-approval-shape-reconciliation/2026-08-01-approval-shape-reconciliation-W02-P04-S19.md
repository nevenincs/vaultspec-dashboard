---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:12fd235fa32f76bf2d6f84fe36a79a7ce0ec43c6a914d7bd58702aa856aacbe7'
step_id: 'S19'
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
     The S19 and 2026-08-01-approval-shape-reconciliation-plan placeholders are machine-filled by
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
     The Add reviewer approval descriptor entries to POLICY_DESCRIPTORS for all three modes and repoint the manual human approval entry at the destructive floor wording and ## Scope

- `frontend/src/stores/server/authoring/reviewStationVocabulary.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add reviewer approval descriptor entries to POLICY_DESCRIPTORS for all three modes and repoint the manual human approval entry at the destructive floor wording

## Scope

- `frontend/src/stores/server/authoring/reviewStationVocabulary.ts`

## Description

- Add `reviewer_approval_required` descriptor entries to `POLICY_DESCRIPTORS` for all three operation modes, satisfying the exhaustive `Record<OperationMode, Record<ApprovalRequirement, MessageDescriptor>>` type; only the `manual` entry is ever actually served by the engine matrix (destructive risk always yields `human_approval_required` regardless of mode; non-destructive risk yields `reviewer_approval_required` only under `manual`).
- Repoint the `manual` mode's `human_approval_required` entry at a new destructive-floor-specific key instead of continuing to share the generic "reviewer approval" wording that now belongs to the new token — the `manual` mode was the one place `human_approval_required` was previously overloaded across both the destructive floor and the general non-destructive manual gate; `assisted`/`autonomous`'s `human_approval_required` already denoted the destructive floor exclusively (both before and after this ADR), so their copy is unchanged.

## Outcome

`POLICY_DESCRIPTORS` is a complete 3x3 matrix over mode and requirement. The `manual.human_approval_required` entry now points at `documents:reviewStation.policy.manualHumanApproval` carrying destructive-floor wording; a new `documents:reviewStation.policy.manualReviewerApproval` key carries the freed-up "reviewer approval" wording for `manual.reviewer_approval_required`.

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
