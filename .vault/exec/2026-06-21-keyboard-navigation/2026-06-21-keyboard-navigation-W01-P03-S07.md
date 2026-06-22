---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-21'
modified: '2026-06-22'
step_id: 'S07'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---




# Remove the dev crash/degrade bar from the production tab ring (not rendered or tabindex -1 outside dev)

## Scope

- `frontend/src/app/degradation/DebugSwitch.tsx`

## Description

- Added `tabIndex={-1}` to the dev "⚒ degrade" `DegradationDebugSwitch` trigger so the debug affordance is out of the keyboard tab ring while staying mouse-clickable.

## Outcome

- Live-verified: the degrade button now reports `tabIndex -1` and no longer appears as an early tab stop. The component already renders only under `import.meta.env.DEV`, so the production tab ring was never affected — this keeps the dev tab order clean for keyboard testing.

## Notes

- Deliberately scoped to the collapsed trigger; the panel's controls (rarely opened, via click) stay keyboard-operable when open. The step's literal goal (removed from the production ring) was already satisfied by the DEV guard.
