---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S93'
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
     The S93 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Prove malformed operations, client path fields, free-form arguments, and implicit data deletion cannot pass the lifecycle dispatcher and ## Scope

- `frontend/src/stores/server/a2aLifecycleActions.test.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Prove malformed operations, client path fields, free-form arguments, and implicit data deletion cannot pass the lifecycle dispatcher

## Scope

- `frontend/src/stores/server/a2aLifecycleActions.test.ts`

## Description

- Added `a2aLifecycleActions.test.ts`: proves the dispatcher handler is registered; that the validator accepts every closed op and nothing else; and that malformed operations, smuggled client paths, free-form args, and implicit data-deletion flags are all refused.
- Proved a malformed payload throws BEFORE any transport call (captured URLs empty).
- Routed a read-only `doctor` run through the seam to the REAL `/a2a/lifecycle/run` broker (live wire, no mock).

## Outcome

Six tests green against the live engine. The one live capability exercised is `doctor` — a read-only op that never mutates the machine-global install — so it is safe against the shared serve. Mutating ops are never dispatched live.

## Notes

None.
