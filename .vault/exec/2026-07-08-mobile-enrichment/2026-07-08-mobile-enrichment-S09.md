---
tags:
  - '#exec'
  - '#mobile-enrichment'
date: '2026-07-09'
modified: '2026-07-09'
step_id: 'S09'
related:
  - "[[2026-07-08-mobile-enrichment-plan]]"
---




# D8: desktop LeftRail tree-level indent guide added to the Figma design (SectionBody), matching the shipped code and the mobile Browse frame — Figma-only, no code change

## Scope

- `figma:SlhonORmySdoSMTQgDWw3w`

## Description

- Add the tree-level indent-guide hairline (bound to the rule color variable, no raw hex) to the `_LeftRail/SectionBody` component's healthy state in the binding Figma file, so every desktop `LeftRail` instance (AppShell, the Left Rail surface) inherits it.

## Outcome

The desktop `LeftRail` design frames now render the tree-level guide on expanded doc groups, matching the shipped frontend (`TreeBrowser` `data-tree-guide`/`guideStyle`) and the mobile Browse frame. Figma-only; the code was already correct, so there is no code change.

## Notes

