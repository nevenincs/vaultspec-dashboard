---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S103'
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
     The S103 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Add the complete localized lifecycle vocabulary, confirmations, progress, ownership, remediation, and data-preservation copy and ## Scope

- `frontend/src/locales/en/common.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the complete localized lifecycle vocabulary, confirmations, progress, ownership, remediation, and data-preservation copy

## Scope

- `frontend/src/locales/en/common.ts`

## Description

- Added the complete localized agent-service vocabulary to the catalog: panel label/actions/unavailable title, description, section headings, install-state and readiness words, ownership, orchestration availability, the ten operation labels, active-generation/progress/outcome copy, the data-preservation assurance, and remove/rollback confirmations.
- Added the matching message-policy roles in a new `messagePolicy.agentService` slice (kept out of the base module to stay under the module-size gate), and registered the keys in the catalog-key contract.

## Outcome

All copy is plain language with no internal vocabulary on screen. Adding it surfaced four legitimate new canonical imperative verbs (Install, Ensure, Run, Revert - Revert also destructive) added to the vocabulary tables, and the prohibited term was reworded. Full localization suite green.

## Notes

The panel LABEL avoids the prohibited internal term (the internal id stays `agent-service`); the visible name is "Agents". Rollback's button reads "Revert" so it leads with a canonical destructive verb.
