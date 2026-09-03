---
tags:
  - '#exec'
  - '#code-deduplication'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:8834f988fbc4579413f4c45c9621df9f2a32bf5fc63e47d715e3abfed1b67e81'
step_id: 'S30'
related:
  - "[[2026-08-01-code-deduplication-plan]]"
---
# Write regression coverage then replace vault-row type maps with canonical vocabulary

## Scope

- `frontend/src/app/left/vaultRowPresentation*`

## Description

- Delete rail-local document-type label and category maps.
- Resolve group labels and category identity through direct canonical vocabulary imports.
- Retain rail-specific marks, status, date, and metadata policy locally.

## Outcome

Vault-row presentation has no duplicated document-type vocabulary and unknown identities fail closed.

## Notes

RAG grounding, strict TypeScript, rail localization and reveal tests, formatting, residue and diff checks, and independent Sol review passed.
