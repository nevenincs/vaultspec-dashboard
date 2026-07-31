---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
body_hash: 'sha256:112d710b07019dd8e5141e93711498b1cbb2976311d318b88724bc408965ea20'
step_id: 'S55'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Standardize and localize canvas background menu actions through canonical graph descriptors

## Scope

- Canvas menu descriptors, graph menu localization tests, catalogs, policy, and exact scanner allowlist.

## Description

- Reuse the canonical graph camera, selection, and working-set descriptors.
- Preserve action IDs, order, sections, icons, effects, and time-travel behavior.
- Prove English, French, and Arabic resolution through production menu descriptors.
- Remove the four exact legacy presentation exemptions.

## Outcome

Canvas background actions use the same typed wording as their command, keybinding, and working-set counterparts without changing behavior.

## Notes

Terra and Sol approved the implementation with no findings. Forty-one root-focused tests and the complete frontend gate passed. The larger stage batch removed sixteen exact legacy action rows, reducing that category from 57 to 41.
