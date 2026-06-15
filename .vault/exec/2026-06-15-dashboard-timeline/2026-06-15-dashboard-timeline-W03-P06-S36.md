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

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-timeline with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S36 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Render derivation arcs reusing the tier-as-treatment edge vocabulary and ## Scope

- `frontend/src/app/timeline/arcs.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
