---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-23'
modified: '2026-06-23'
step_id: 'S23'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---




# Enroll the plan step tree onto FocusZone tree semantics (rove rows, expand/collapse) as one tab stop

## Scope

- `live-verify`
- `frontend/src/app/right/PlanStepTree.tsx`

## Description

- Enrolled the right-rail plan step tree onto `useFocusZone`: every SELECTABLE step now joins one vertical roving order (the tree is a single tab stop; arrows/Home/End move between steps, Enter/Space selects via the native button). Threaded a `nav` (rove + setActive) through PlanStepTree → WaveGroup → PhaseGroup → StepRow and the ungrouped steps.
- Fixed a real gap: the step buttons were hardcoded `tabIndex={-1}` — the plan steps were entirely keyboard-UNREACHABLE (could not navigate to or select a step by keyboard). Non-selectable (disabled) steps stay out of the order.

## Outcome

- Live-verified: with multiple plans expanded (9 step trees, 207 steps, 23 selectable), exactly one tab stop appears per step-tree-with-selectable-steps; focusing it and pressing ArrowDown roved step S01 → S02. tsc/eslint/prettier clean; PlanStepTree/StatusTab tests (3) green.

## Notes

- A plan whose steps have no target graph node renders all steps disabled (non-selectable) → that tree contributes no tab stop, which is correct (nothing to select). The roving activates only for plans with selectable steps.
- Each expanded plan's step tree is its own FocusZone (one tab stop each); this is the clean, contained right-rail win. The rail's fold-header roving (S21), heterogeneous list rows incl. the display-only PrRow (S22), and search (S24) remain larger pieces.
