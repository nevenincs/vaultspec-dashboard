---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S104'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace a2a-product-provisioning with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S104 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Prove the command provider exposes exactly one localized agent-service toggle through the shared action registry and ## Scope

- `frontend/src/stores/view/commandProviders/controlPanelsCommandProvider.test.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Prove the command provider exposes exactly one localized agent-service toggle through the shared action registry

## Scope

- `frontend/src/stores/view/commandProviders/controlPanelsCommandProvider.test.ts`

## Description

- Extended the control-panels command-provider test: proved the provider surfaces the four modal panels plus the review inbox in cluster order, and asserted EXACTLY ONE agent-service toggle under the shared `panel:agent-service` id, flipping to its hide label when the panel is open.

## Outcome

The command provider derives the agent-service toggle automatically from `CONTROL_PANEL_IDS`; the test proves it is enrolled exactly once through the shared action registry, under the `app` family. Green.

## Notes

None.
