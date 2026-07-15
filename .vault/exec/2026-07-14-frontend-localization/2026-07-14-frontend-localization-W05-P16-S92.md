---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
step_id: 'S92'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize compact application shell navigation and accessibility copy through canonical shared descriptors

## Scope

- Compact shell navigation descriptors, catalogs, exact allowlist, and live multilingual render tests.

## Description

- Reuse canonical Search and filter action descriptors.
- Localize skip navigation, surface headings, workspace guidance, and the Vault fallback.
- Keep the workspace basename as untranslated user data inside one complete catalog message.
- Remove the user-facing em dash composition.
- Prove English, French, and Arabic updates on the same DOM nodes.

## Outcome

Compact shell navigation and accessibility copy is catalog-owned while workspace identity remains bounded user data. Action identity and behavior remain unchanged.

## Notes

The live test mounts the real shell, localization runtime, and query client without mocks. Sol approved the final consumer proof with no findings. The focused suite and complete frontend gate passed.
