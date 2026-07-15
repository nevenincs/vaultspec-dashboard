---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
step_id: 'S220'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Resolve mobile top-bar accessibility messages from strict typed descriptors while preserving an operable Back escape

## Scope

- Mobile top-bar accessibility descriptors, multilingual catalogs, policy, and real render tests.

## Description

- Replace Back and workspace-trigger source strings with typed messages.
- Restrict accessibility overrides to message descriptors.
- Preserve an operable Back action when message resolution uses the safe fallback.
- Disable an optional title action when its accessible message cannot resolve.
- Prove English, French, and Arabic reactivity without changing DOM identity.

## Outcome

The mobile top bar resolves all accessibility copy through catalogs, never exposes message keys, and cannot trap compact-reader users when localization data is unavailable.

## Notes

Sol identified and verified the essential Back escape requirement, then approved the final diff with no findings. The focused suite and complete frontend gate passed.
