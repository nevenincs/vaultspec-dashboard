---
tags:
  - '#exec'
  - '#mobile-enrichment'
date: '2026-07-09'
modified: '2026-07-09'
step_id: 'S03'
related:
  - "[[2026-07-08-mobile-enrichment-plan]]"
---

# D3: hoist the canonical Vault/doc-type/title trail into a shared helper consumed by DocPanel and CompactDocReader, retiring the bare 2-item breadcrumb

## Scope

- `frontend/src/app/viewer/docTrail.ts`

## Description

- Hoist the canonical Vault / doc-type / title trail into a shared `buildDocTrail` helper.
- Consume it from `DocPanel` (replacing the inline `docTrail`) and `CompactDocReader` (replacing the bare 2-item breadcrumb).

## Outcome

Both the desktop dock reader and the compact slide-in reader derive ONE 3-segment trail; the compact reader shows Vault › <doc-type> › title.

## Notes
