---
tags:
  - '#exec'
  - '#code-deduplication'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:54ed1b8013297cb1b2b3db4f2ec5a4143adb014f34b3f37a0f487061b2012c18'
step_id: 'S06'
related:
  - "[[2026-08-01-code-deduplication-plan]]"
---
# Write regression coverage for localized types and remove the deprecated vocabulary alias

## Scope

- `frontend/src/stores/server/docTypeVocabulary*`

## Description

- Retain localized descriptor and fail-closed regression coverage for the six displayable document types.
- Delete the deprecated source-English label fallback and its test-only compatibility assertion.

## Outcome

The vocabulary now exposes descriptors only; all production callers resolve localized presentation directly and unknown values remain absent.

## Notes

Strict TypeScript, focused localization tests, formatting, zero-residue search, diff hygiene, and independent Sol review passed.
