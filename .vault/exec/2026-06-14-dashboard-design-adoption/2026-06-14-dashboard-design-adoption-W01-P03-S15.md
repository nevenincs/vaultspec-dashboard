---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S15'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---

# Define motion tokens with prefers-reduced-motion instant-swap, ensuring keyboard-initiated actions never animate

## Scope

- `frontend/src/styles.css`

## Description

- Define motion tokens for a fast, subtle, state-communicating register: a settle easing, a snap easing, and a duration band from instant through fast, base, and slow.
- Add an explicit instant (0ms) duration token so keyboard-initiated actions never animate.
- Strengthen the prefers-reduced-motion floor to an instant-swap that also pins animation-iteration-count and scroll-behavior, and add a tied-to-real-state liveness pulse keyframe (the Codex thinking-state lesson), never ambient.

## Outcome

Motion is tokenized and reduced-motion is an instant-swap floor honored app-wide (ADR layer 6). The liveness cue exists as a keyframe tied to genuine in-progress state; keyboard actions resolve through the instant duration token.

## Notes

The reduced-motion media query now also clamps iteration count and scroll-behavior, closing two gaps in the prior floor; the existing fade/slide keyframes are preserved unchanged so current consumers keep working.
