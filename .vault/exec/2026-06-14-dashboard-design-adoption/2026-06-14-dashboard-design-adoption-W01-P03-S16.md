---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S16'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---




# Define the multi-level elevation, radius, and density tokens (background to foreground to panel to dialog to modal)

## Scope

- `frontend/src/styles.css`

## Description

- Define the multi-level elevation, radius, and density tokens.
- Author a five-level elevation scale (flat, card, panel, float, dialog, deep) as ink-tinted shadows in light, deepened against the dark ground, and replaced with outline rings in high-contrast.
- Add a modal-scale radius step to the existing rounded radius family and keep the 4px-base density spacing grid.

## Outcome

Depth is expressed through a multi-level elevation scale (background to foreground to panel to dialog to modal) and consistently rounded geometry (ADR layer 4), with density preserved on the 4px grid. Shadows harmonize with the warm palette via ink-tinting.

## Notes

High-contrast replaces shadows with 1px outline rings because shadow contrast is unreliable for a11y; this keeps elevation legible without depending on soft depth in that theme.
