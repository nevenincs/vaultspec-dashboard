---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S03'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# record the renderer verdict, PixiJS v8 confirmed or sigma.js v3 fallback invoked, against ADR row G6.b and flag any deviation to the ADR

## Scope

- `frontend/spike`

## Description

- Weigh the S02 gate numbers against the G6.b criteria (smooth at 1k/5k,
  usable at 10k/50k) and the named sigma.js v3 fallback trigger.
- Record the verdict here and report it to team-lead with the single open
  condition, rather than editing the decisions register directly.

## Outcome

**Verdict: PixiJS v8 CONFIRMED. The sigma.js v3 fallback is NOT invoked.**

- The 1k/5k smooth gate passes outright (vsync-locked in every phase).
- The 10k/50k usable gate now passes in every measured phase, including the
  scrub-style settled-animating case the foundation run failed at 7.5 fps
  (now 59.3 fps after the S01 mesh-based edge fix) and continuous-layout at
  36 fps (was 8.7).
- No evidence emerged that would trigger the fallback: the failure mode the
  foundation audit identified was CPU-side tessellation, fixed by a standard
  Pixi technique, not an architectural limit; sigma.js would face the same
  geometry-update economics with less node-anatomy freedom. The fallback
  stays named and architecture-compatible behind the SceneController seam.

No deviation from ADR row G6.b - the decision is confirmed, not changed.

## Notes

One condition remains open on the row's own wording: the gate is stated "on
integrated GPUs" and this seat has a discrete RTX 4080 SUPER. The S02 numbers
are an upper bound. Reported to team-lead as the wave's known manual item
(five-minute harness run on any iGPU machine); per their dispatch this does
not block W01. The G6.b flag itself is a human-visibility flag, so the
verdict plus the open condition were messaged to team-lead for the ADR-side
annotation; the register row is owned by the architects, not edited here.
