---
tags:
  - '#exec'
  - '#universal-data-loading'
date: '2026-07-11'
modified: '2026-07-11'
step_id: 'S11'
related:
  - "[[2026-07-11-universal-data-loading-plan]]"
---

# Render the honest partial-narrow affordance in the rail while the tree drain is incomplete ('N of an at-least total' with the loading floor), and guard-test narrow-during-drain so matches beyond the loaded prefix never silently vanish

## Scope

- `frontend/src/app/left/TreeBrowser.tsx + guard test`

## Description

Render the honest partial affordance in `TreeBrowser.tsx`: a polite live-region line (`Still loading the full list - N documents so far`) while `complete` is false, and the filtered-to-nothing empty message becomes `No matches yet - the list is still loading` during the drain; narrowing re-derives per render as pages land. Guard tests added in `engine.test.ts`: partial prefixes are growing, flagged `complete:false`, the resolved set is whole, and the drain entry settles.

## Outcome

Matches beyond the loaded prefix can never silently vanish: the partial state is explicit until the drain completes.

## Notes
