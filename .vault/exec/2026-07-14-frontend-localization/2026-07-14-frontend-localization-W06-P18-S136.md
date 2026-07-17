---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S136'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Reject raw exception, token, identifier, path, command, and served-reason interpolation into general UI messages

## Scope

- `frontend/src/localization/catalogSafety.test.ts`

## Description

- Swept `validateEnglishMessage`'s diagnostic/raw-key/raw-placeholder/nested-message
  codes over every `MESSAGE_KEY` in the catalog — zero hits.
- Added adverse coverage per unsafe class: raw exception, raw path, raw command, raw
  network origin, raw namespace-qualified key, malformed placeholder.
- Added a negative-negative proof: a properly-typed `{{count, number}}`/
  `{{document}}` interpolation is NOT flagged, so the check doesn't over-reject
  legitimate structured interpolation.

## Outcome

General UI messages are now provably free of raw internal/diagnostic interpolation
(exception text, tokens, identifiers, paths, commands, served reasons), with
adversarial proof per unsafe class and a proof the check doesn't false-positive on
legitimate structured placeholders.

## Notes

Landed at commit `65df838460` (same batch as `S130`/`S135`). This record was
authored during a fill pass (bookkeeping only, no code changes by me).

Independently reverified: `git show 65df838460 --stat` confirms
`catalogSafety.test.ts`; live rerun — 5/5 passed (part of the 23/23 combined
W06.P18 run), including the per-class adverse cases and the legitimate-
interpolation negative-negative; ESLint clean.
