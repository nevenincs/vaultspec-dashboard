---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S96'
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
     The S96 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Render install, start, stop, restart, repair, update, rollback, remove, doctor, progress, ownership, and remediation from the lifecycle store projection and ## Scope

- `frontend/src/app/panels/A2aLifecyclePanel.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Render install, start, stop, restart, repair, update, rollback, remove, doctor, progress, ownership, and remediation from the lifecycle store projection

## Scope

- `frontend/src/app/panels/A2aLifecyclePanel.tsx`

## Description

- Added the agent-service lifecycle control panel, split like `ProvisionPanel`: a dumb, props-driven `A2aLifecyclePanelBody` and a thin wired `A2aLifecyclePanel` wrapper.
- The wrapper reads the stores hooks and memoizes `deriveA2aLifecycleView` in one `useMemo` (never a fresh reference per render).
- The body renders Status (readiness dot + word + active generation), Orchestration (availability + ownership, served reason surfaced as an authored title tooltip), Actions (eligible ops), and Diagnostics (doctor); destructive ops (remove/rollback) open a `ConfirmDialog` before dispatch.

## Outcome

Every displayed value is backend-served; the eligible-op set is a UX affordance hint and the engine refuses authoritatively. All copy resolves through the localization catalog; the panel fetches nothing and reads no raw tiers. Gate green.

## Notes

The served orchestration reason may carry product-internal wording, so it is shown via `authoredDisplayText` as a title tooltip (the sanctioned escape the Team selector uses), never as raw visible copy.
