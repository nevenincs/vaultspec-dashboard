---
tags:
  - '#exec'
  - '#create-panel-hardening'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S11'
related:
  - "[[2026-07-14-create-panel-hardening-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace create-panel-hardening with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S11 and 2026-07-14-create-panel-hardening-plan placeholders are machine-filled by
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
     The Add the one-click prerequisite affordance on ineligible type rows: activating the reason selects and focuses the missing upstream type (ADR D3's promised path) and ## Scope

- `frontend/src/app/left/CreateDocDialog.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the one-click prerequisite affordance on ineligible type rows: activating the reason selects and focuses the missing upstream type (ADR D3's promised path)

## Scope

- `frontend/src/app/left/CreateDocDialog.tsx`

## Description

- Implement the one-click prerequisite path (ADR D3's promised affordance): activating an ineligible type row walks the served reason chain (plan -> decision record -> research/reference) to the first ELIGIBLE upstream type and selects + focuses it, instead of a dead no-op.

## Outcome

Locked by a live-engine test (selection moved to audit first so the routing is observable). The reachable aria-disabled rows from P02 make the affordance keyboard-operable for free.

## Notes

The chain walk is bounded (three hops, the pipeline's depth) and reads only served notes - no client recomputation of the hierarchy gate.
