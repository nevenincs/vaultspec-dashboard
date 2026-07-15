---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
step_id: 'S66'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize search-result menus without internal ranking or record copy

## Scope

- Search-result menu composition, shared canvas action reuse, tests, and exact scanner allowlist.

## Description

- Replace both custom focus branches with the canonical Show on canvas action.
- Preserve the existing action ID and scoped selection effect.
- Remove ranking-value and serialized-result copy actions.
- Retain external opening, file navigation, and byte-identical source-path copying.

## Outcome

Search-result menus now expose product actions and authored source paths without offering
ranking values, node terminology, or internal record shapes.

## Notes

Forty-five affected tests and the complete frontend lint recipe passed. Independent
review found no issues. Four exact scanner rows were removed.
