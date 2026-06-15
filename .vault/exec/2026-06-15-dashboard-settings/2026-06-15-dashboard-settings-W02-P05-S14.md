---
tags:
  - '#exec'
  - '#dashboard-settings'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S14'
related:
  - "[[2026-06-15-dashboard-settings-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-settings with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S14 and 2026-06-15-dashboard-settings-plan placeholders are machine-filled by
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
     The Add a captured-sample test proving mock mirrors live schema and value shape through the client adapter path and ## Scope

- `frontend/src/stores/server/settings.test.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add a captured-sample test proving mock mirrors live schema and value shape through the client adapter path

## Scope

- `frontend/src/stores/server/settings.test.ts`

## Description

- Added the parity test: a captured live `/settings/schema` sample fed through the tolerant `adaptSettingsSchema`, mock-vs-live equality through the client path, typed-error parity, and the effective-value selector.

## Outcome

mock-mirrors-live-wire-shape proven in executable form.

## Notes

