---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S36'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---




# Render derivation arcs reusing the tier-as-treatment edge vocabulary

## Scope

- `frontend/src/app/timeline/arcs.ts`

## Description

- Add the pure `arcs` module: a tier-as-treatment resolver mapping each provenance
  tier to its line treatment, reusing the stage edge vocabulary (declared solid
  inked, structural solid status-hued by resolution state, temporal dotted via a
  stroke-dasharray, semantic a wide faint haze) and the four-bucket confidence
  lightness quantization mirrored from the scene `confidenceBucket`.
- Carry the treatment as a descriptor (style, stroke token name, dash, width,
  opacity, lightness bucket) so the SVG resolves colour through the cascade via
  `var(--token)` without a literal-hex getComputedStyle read.
- Add the arc geometry helper producing a smooth cubic path bowed above/below the
  lanes by direction (flowing down to a later lane bows below, up to an earlier
  lane bows above) so the derivation chain reads left-to-right-and-down.

## Outcome

A pure, unit-testable arc treatment and geometry API downstream phases consume;
arcs share the stage's tier vocabulary and read in grayscale by line treatment.

## Notes

Confidence rides the lightness bucket, never opacity alone, matching the channel
discipline the scene edge meshes use; the opacity floor only keeps faint dots and
the haze legible without becoming the sole confidence channel.
