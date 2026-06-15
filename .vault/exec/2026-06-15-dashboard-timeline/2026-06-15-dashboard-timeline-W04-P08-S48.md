---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S48'
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
     The S48 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Reuse the tier dial in the control bar with semantic inapplicable in time-travel and ## Scope

- `frontend/src/app/timeline/TimelineControls.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Reuse the tier dial in the control bar with semantic inapplicable in time-travel

## Scope

- `frontend/src/app/timeline/TimelineControls.tsx`

## Description

- Reuse the existing stage tier dial directly in the control bar (declared/structural/temporal/semantic) rather than reinventing it.
- The dial already reads the shared timeline mode and renders the semantic tier INAPPLICABLE in time-travel (disabled, designed state) and OFFLINE when rag is down; compose it unchanged.

## Outcome

The tier dial renders inside the control bar; in time-travel mode the semantic tier reads its inapplicable state. Verified by a component test that sets time-travel mode and asserts the semantic switch is disabled with the inapplicable data-state, confirming the reused dial honors the shared mode.

## Notes

No edit to the tier dial was needed: it already reads time-travel mode and degradation through its own stores selectors, so composing it satisfies the semantic-inapplicable contract with zero new code.
