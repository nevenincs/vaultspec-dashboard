---
tags:
  - '#audit'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:4f2e5cb15032e2db5e0c0b657be2f6cdb0dc6bd23fbc41c3b9c2ae692aa639b2'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
  - "[[2026-09-05-design-system-consolidation-adr]]"
  - "[[2026-09-05-design-system-consolidation-horizontal-polish-research]]"
  - "[[2026-09-05-design-system-consolidation-shipped-frontend-blueprint-reference]]"
---
# `design-system-consolidation` audit: `S170 residual native-control classification review`

## Scope

Reviewed exact Step `W01.P01.S170`: the 55 entries appended after the accepted S169 prefix, their stable identities, canonical owners, dispositions, and rationale accuracy against live controls. The review challenged the 22 planned `OptionRow`, five `IconButton`, 11 `Button`, and 17 retained-composite mappings, including picker and session rows, RAG table controls, structural right-rail rows, compact shell controls, comment-body editing, and the platform error-boundary handoff.

An independent TypeScript AST probe reproduced 125 executable JSX sites (`button` 100, `input` 19, `select` 1, `textarea` 5). The completed ledger imports as 125 entries with 125 unique collision-safe source keys and exact path-plus-element multiset equality. The appended S170 slice is exactly 55 buttons, divided into 38 `migrate` and 17 `retain-semantic-seam` dispositions. The source diff starts only after the prior 70-entry prefix, so no earlier identity or disposition was rewritten. Current app and platform production sources have no diff; unrelated dirty scene work remains outside scope. `git diff --check` passed for the ledger, and independent `just lint frontend` exited 0 across ESLint, localization, relative-unit, domain, module-size, formatting, typecheck, token-drift, and Figma-name checks.

## Findings

### clarification-choice-roving-overclaim | medium | The choice-option rationale promises a keyboard behavior absent from the baseline

The `ClarificationCard` `choice-option` replacement rationale in `consolidation-ledger.ts:1860` says migration will retain "group roving behavior." The executable option site at `ClarificationCard.tsx:216` has neither `useFocusZone`, roving `tabIndex`, nor Arrow-key handling; its only custom key path parses numeric accelerators. A nearby source comment uses the word "roving," but comments are not executable baseline evidence. The planned `OptionRow` contract explicitly leaves roving navigation with composing chrome, so this wording could let a later migration falsely claim preservation of a behavior no owner currently implements. The `OptionRow` disposition itself remains suitable.

### document-search-active-descendant-overclaim | medium | The result-option rationale names ARIA coordination the surface does not implement

The `DocumentSearchSurface` `document-result-option` replacement rationale in `consolidation-ledger.ts:2378` says migration will retain "active-descendant cursoring." The live combobox at `DocumentSearchSurface.tsx:141` has no `aria-activedescendant`, and the result options at line 171 have no ids that such an attribute could reference. The surface does keep focus in the input and moves an application cursor with Arrow keys, which the earlier query-input classification accurately calls result cursoring. Calling it active-descendant coordination is therefore a factual accessibility-contract overclaim. The `OptionRow` disposition itself remains suitable.

### s170-rationale-fixes-verified | low | Both requested corrections now match executable behavior

Recheck confirmed that the `ClarificationCard` replacement now retains only numeric accelerators, answer drafting, and single-choice immediate submission, while the `DocumentSearchSurface` replacement now retains input-owned result cursoring without claiming ARIA active-descendant coordination. No adjacent identity, disposition, canonical owner, or rationale changed. The independent post-revision probe again produced 125 AST sites, 125 ledger entries, 125 unique keys, zero path-plus-element multiset mismatches, and the exact S170 split of 55 entries with 38 migrations and 17 retained seams. `git diff --check` passed, and the reviewer reran full `just lint frontend` to exit 0.

No other S170 disposition, identity, owner, or boundary defect was found. The retained controls each carry structural, responsive, data-grid, roving-composite, status, or content-editing behavior not expressed by a current primitive. The platform actions correctly point to app-owned `Button` composition through the planned injected renderer and do not authorize a platform-to-app import.

## Recommendations

- Resolved: the `ClarificationCard` replacement now records only the shipped numeric-key and submission behavior. Any future Arrow-key roving remains a separately authorized and tested behavior change.
- Resolved: the `DocumentSearchSurface` replacement now records input-owned result cursoring rather than nonexistent ARIA active-descendant coordination.
- Carry the complete 125-site and source-key invariants into S171's mechanical test coverage.

Status: PASS.
