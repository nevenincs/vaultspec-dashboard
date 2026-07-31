---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-07-12'
body_hash: 'sha256:f5f307d148c4c708a0d308291c4c663a8f0ad4563fc538e3ae3077b1d9b88725'
step_id: 'S15'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---

# Map the required language set and the long tail to grammar loaders and a language_hint resolver shared by both viewers

## Scope

- `frontend/src/app/viewer/languages.ts`

## Description

- Map the full required language set (rust, python, js, ts, jsx, tsx, bash, batch, powershell, c, cpp, json, toml, yaml, markdown) plus css/html to per-language lazy `@shikijs/langs/*` imports.
- Add a `resolveGrammar` hint resolver shared by both viewers, normalizing fence-info and extension aliases (rs, ts, sh, c++, yml, …) onto canonical grammar ids, returning null for an unknown hint so the viewer renders plain text.

## Outcome

Both viewers share one language vocabulary and one resolver; the resolver test covers the required set, the alias normalization, and the null degradation.

## Notes

None.
