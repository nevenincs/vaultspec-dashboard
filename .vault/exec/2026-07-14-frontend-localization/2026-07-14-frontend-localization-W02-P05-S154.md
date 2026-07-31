---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
body_hash: 'sha256:8ab203905a1495f9db6d071e775e7d03022ff978d6ee31cbee07e13090d5cafe'
step_id: 'S154'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Standardize graph command builders without focus, node, or layout implementation jargon

## Scope

- Graph command builders, graph catalogs, policy, localization tests, and scanner baseline.

## Description

- Replace camera and movement strings with typed graph action descriptors.
- Use plain view, movement, and settings language instead of implementation terminology.
- Preserve command identity, execution lanes, callback arguments, and state inversion.

## Outcome

Graph commands now use short user-facing actions, including approved Zoom vocabulary, with no layout-state leakage.

## Notes

Both movement-state directions and all graph callbacks passed behavioral tests. Sol approved Zoom as the canonical camera verb.
