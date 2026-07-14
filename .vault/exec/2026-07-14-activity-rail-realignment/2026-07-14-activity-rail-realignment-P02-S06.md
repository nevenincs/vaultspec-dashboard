---
tags:
  - '#exec'
  - '#activity-rail-realignment'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S06'
related:
  - "[[2026-07-14-activity-rail-realignment-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace activity-rail-realignment with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S06 and 2026-07-14-activity-rail-realignment-plan placeholders are machine-filled by
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
     The Enroll one ActionDescriptor per panel toggle across the palette and keymap planes and extend the action-coverage guard and ## Scope

- `frontend/src/stores/view/chromeActions.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Enroll one ActionDescriptor per panel toggle across the palette and keymap planes and extend the action-coverage guard

## Scope

- `frontend/src/stores/view/chromeActions.ts`

## Description

<!-- Succinct line-by-line list of steps executed. Use imperative language, mirroring git commit summary lines. -->

## Outcome

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->

## Description

- Add CONTROL_PANEL_ACTION_IDS + toggle-action builders to the chrome actions plane; register the new `controlPanelsCommandProvider` in the real registration path.
- Extend the action-coverage and command-palette guards with the four panel ids.

## Outcome

Four descriptors (`panel:search-service`, `panel:approvals`, `panel:backend-health`, `panel:vault-health`) resolve in the palette under shared ids; guards green. Executed by rail-stores-coder; verified independently.

## Notes

PALETTE-ONLY by convention: the Settings analogue has no keymap chord and the registry rejects chord-less defs, so no keymap entries were added.
