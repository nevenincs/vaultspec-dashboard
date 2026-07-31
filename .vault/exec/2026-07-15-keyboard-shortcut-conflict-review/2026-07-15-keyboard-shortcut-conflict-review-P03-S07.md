---
tags:
  - '#exec'
  - '#keyboard-shortcut-conflict-review'
date: '2026-07-15'
modified: '2026-07-17'
body_hash: 'sha256:0a66aa5ebc1c579ba697771ebab7e2227e5fba6e44ea02f711cee75eabce32b6'
step_id: 'S07'
related:
  - "[[2026-07-15-keyboard-shortcut-conflict-review-plan]]"
---

# Add the isComposing (and keyCode 229 fallback) early-out before context resolution, with a dispatcher test proving a bound bare-key chord does not fire mid-composition (D6)

## Scope

- `frontend/src/stores/view/keymapDispatcher.ts`

## Description

- Add the isComposing / keyCode 229 early-out before context resolution in handleKeymapEvent; add dispatcher tests proving a bound bare-key chord neither fires nor is consumed mid-composition.

## Outcome

The IME composition gap closes at the one dispatcher gate for every binding uniformly (ADR D6).

## Notes
