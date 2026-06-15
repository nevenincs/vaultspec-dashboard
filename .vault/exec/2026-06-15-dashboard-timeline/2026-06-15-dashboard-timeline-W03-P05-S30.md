---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S30'
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
     The S30 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add the belt-and-suspenders client mark and arc cap and ## Scope

- `frontend/src/app/timeline/scrollStrip.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the belt-and-suspenders client mark and arc cap

## Scope

- `frontend/src/app/timeline/scrollStrip.ts`

## Description

- Export the belt-and-suspenders client ceilings `MAX_TIMELINE_MARKS` and `MAX_TIMELINE_ARCS` (arcs higher, since a node can carry several).
- Add a pure `capItems(items, max)` returning a `Capped<T>` (the kept items plus how many were `dropped`), truncating to at most `max`.
- Treat a non-positive or non-finite `max` as drop-everything rather than throwing; return a copy so caller state is never aliased.

## Outcome

The surface can never render an unbounded mark or arc count even if the engine somehow serves one: the cap truncates and reports the dropped count so the truncation is stated, not silent. This is the client half of the ADR's bounded-and-honest reads, complementing the engine's document node ceiling.

## Notes

Pure and allocation-safe: `capItems` always returns a fresh array, so callers cannot mutate the source through the result.
