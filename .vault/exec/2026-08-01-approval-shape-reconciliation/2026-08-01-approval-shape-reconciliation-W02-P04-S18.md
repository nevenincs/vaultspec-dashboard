---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:c58f142b7bf47179cb27d93f3405f9d334b83ea906083aa66b62947690e691ac'
step_id: 'S18'
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
     The S18 and 2026-08-01-approval-shape-reconciliation-plan placeholders are machine-filled by
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
     The Widen the ApprovalRequirement union to include reviewer_approval_required and ## Scope

- `frontend/src/stores/server/authoring/wireTypes.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Widen the ApprovalRequirement union to include reviewer_approval_required

## Scope

- `frontend/src/stores/server/authoring/wireTypes.ts`

## Description

- Widen the served `ApprovalRequirement` union type from `"human_approval_required" | "system_auto_approvable"` to add `"reviewer_approval_required"`, matching the engine's three-way `ApprovalRequirement` enum (ADR D1).
- Document the new token's meaning inline: `human_approval_required` is now the destructive floor only, enforced in every mode; `reviewer_approval_required` is the `manual`-mode non-destructive case.

## Outcome

`ApprovalRequirement` carries the new `reviewer_approval_required` member. No consumer performs an exhaustive switch over the union (the adapter casts the served string directly), so widening the type introduced no compile break outside the intentionally-updated vocabulary/test files.

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
