---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S64'
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
     The S64 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Make arcs reachable from their endpoints, announcing the relation and endpoints and ## Scope

- `frontend/src/app/timeline/arcs.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Make arcs reachable from their endpoints, announcing the relation and endpoints

## Scope

- `frontend/src/app/timeline/arcs.ts`

## Description

- Verified arcs are reachable from their endpoints: the arc group is `aria-hidden` decorative paint, while each endpoint mark appends incident-relation phrases built from the arc-endpoint-label helper (relation plus joined endpoint, direction-aware), so an arc relation and endpoints are announced without the arc becoming its own tab-stop.

## Outcome

Arc relation + endpoints announced from the endpoint marks; arcs themselves are aria-hidden, no extra tab-stops. Satisfied by the prior partial run; assessed and confirmed.

## Notes

Source satisfied by the prior partial run. This run confirmed the S64 render test (a mark names an incident relation + endpoint, arcs group is aria-hidden) and the pure arc-endpoint-label direction test.
