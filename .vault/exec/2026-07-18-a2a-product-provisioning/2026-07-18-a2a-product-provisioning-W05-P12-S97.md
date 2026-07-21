---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S97'
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
     The S97 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Prove cold, owned, foreign, updating, rollback, degraded, and destructive-confirmation presentations using the production panel component and ## Scope

- `frontend/src/app/panels/A2aLifecyclePanel.render.test.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Prove cold, owned, foreign, updating, rollback, degraded, and destructive-confirmation presentations using the production panel component

## Scope

- `frontend/src/app/panels/A2aLifecyclePanel.render.test.tsx`

## Description

- Added the panel render test exercising the production `A2aLifecyclePanelBody` with constructed views and the REAL localization runtime (isolated view data, the permitted carve-out).
- Covered cold (running-idle + process control), owned (managed by this app), foreign (orchestration unavailable + managed elsewhere + title tooltip, no raw reason), updating/busy (progress), rollback + remove (destructive confirmation gating), degraded recovery-required, and job-outcome presentations.

## Outcome

Ten tests green. Destructive ops dispatch ONLY after the confirm is accepted; cancelling never dispatches. The served reason is proven present as a title attribute and absent from visible text.

## Notes

None.
