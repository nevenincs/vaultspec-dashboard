---
tags:
  - '#exec'
  - '#code-deduplication'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:c2d2dc2d65a26ef7248b4bcc092dedf827f9d287e47a78ec674dbc1af9db3151'
step_id: 'S29'
related:
  - "[[2026-08-01-code-deduplication-plan]]"
---
# Write regression coverage then replace breadcrumb type labels with canonical vocabulary

## Scope

- `frontend/src/app/viewer/docTrail*`

## Description

- Delete the breadcrumb-local document-type map and capitalization fallback.
- Have desktop and compact readers resolve canonical descriptors directly and pass localized labels to the presentation-only trail helper.
- Prove unknown document types omit their type crumb.

## Outcome

Breadcrumbs now rely on the single canonical vocabulary with desktop and compact root policies preserved.

## Notes

The direct helper test covers label and omission behavior; Sol static review confirmed both callers resolve descriptors. Strict TypeScript, formatting, residue and diff checks passed.
