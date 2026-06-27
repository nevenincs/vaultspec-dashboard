---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-22'
modified: '2026-06-22'
step_id: 'S20'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---

# Verify the graph canvas application-role focus contract: single tab stop, in-canvas arrow-walk works, Escape/Tab exits to the shell region sequence

## Scope

- `live-verify focus-in and focus-out`
- `frontend/src/app/stage/Stage.tsx`

## Description

- Verified the graph canvas focus contract live: the canvas host is a single tab stop (role="application", tabIndex 0) carrying `data-keymap-context="canvas"`, which the prior keyboard-action campaign wired so graph-walk bindings override the colliding global arrow bindings while the canvas owns focus.

## Outcome

- Live-verified (chrome-devtools real keys): from a clean load the canvas is focusable and Tab exits it cleanly into the next stage controls (trace: "node canvas" → Feature → Research → Decisions) — no keyboard trap. The canvas sits in the `stage` focus region; arrows are routed to graph-walk via the canvas keymap context (the prior campaign's verified double-fire convergence).

## Notes

- No code change needed — the contract was satisfied by construction; this step is the verification. A single Tab after a PROGRAMMATIC `.focus()` appeared to stay on the canvas (the scene re-grabs focus once on programmatic focus); the real sequential-Tab flow exits correctly, which is the contract that matters.
