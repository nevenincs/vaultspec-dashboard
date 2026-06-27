---
tags:
  - '#exec'
  - '#dashboard-left-rail'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S04'
related:
  - "[[2026-06-14-dashboard-left-rail-plan]]"
---

# Add a compact keyboard-reachable vault/code mode toggle to the browser region defaulting to vault

## Scope

- `frontend/src/app/left/`

## Description

- Add `BrowserModeToggle`: a compact ARIA `tablist` segmented control with two tabs (vault default, code), Phosphor domain marks (`Books` / `TreeStructure`) distinct by shape at 14px.
- Roving tabindex plus ArrowLeft/Right/Up/Down move-and-activate so the mode is keyboard-reachable and switchable without a pointer.

## Outcome

A compact, keyboard-reachable vault/code toggle defaulting to vault is committed.

## Notes

Mode marks are grayscale-safe by shape; selection rides fill plus weight, never hue alone.
