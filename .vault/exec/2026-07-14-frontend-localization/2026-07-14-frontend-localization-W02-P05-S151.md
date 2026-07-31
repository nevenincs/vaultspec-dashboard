---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
body_hash: 'sha256:5b503f9b350e6ffbf75cf4c61814445f2b0a4438ef17cc5e4404014a7023856c'
step_id: 'S151'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Standardize window-management command builders on imperative sentence-case messages

## Scope

- Window command builders, catalogs, policy, localization tests, and scanner baseline.

## Description

- Replace navigation-panel, timeline, and reset-layout source strings with typed descriptors.
- Preserve command identity, state inversion, visibility gates, order, and callbacks.
- Resolve the complete command set through English, French, and Arabic test runtimes.

## Outcome

Window commands now use concise imperative catalog messages without source-language prefixes or raw state-derived copy.

## Notes

Terra implemented the migration and Sol independently approved it. Integrated tests and the full frontend gate passed.
