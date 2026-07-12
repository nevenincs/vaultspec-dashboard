---
tags:
  - '#exec'
  - '#mobile-unified-rail'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S02'
related:
  - "[[2026-07-12-mobile-unified-rail-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace mobile-unified-rail with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S02 and 2026-07-12-mobile-unified-rail-plan placeholders are machine-filled by
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
     The Add a view-local fold store for the unified rail's STATUS and BROWSE top-level sections, both expanded by default, Status first and ## Scope

- `frontend/src/stores/view/compactRailSections.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add a view-local fold store for the unified rail's STATUS and BROWSE top-level sections, both expanded by default, Status first

## Scope

- `frontend/src/stores/view/compactRailSections.ts`

## Description

- Add a view-local fold store for the unified rail's STATUS and BROWSE top-level sections, both defaulting open.
- Expose primitive-returning selector hooks and standalone toggle/reset functions mirroring the compact surface store.

## Outcome

The two top-level sections have independent, testable fold state. Delegated to a supervised Opus coder; verified against the consuming component's imports and the stable-selector law.

## Notes

Authored by a delegated Opus coder under orchestrator supervision; the orchestrator owns the gate and the commit.
