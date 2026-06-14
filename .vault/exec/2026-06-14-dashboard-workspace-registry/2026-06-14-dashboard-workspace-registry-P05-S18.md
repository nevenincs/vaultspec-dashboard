---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S18'
related:
  - "[[2026-06-14-dashboard-workspace-registry-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-workspace-registry with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S18 and 2026-06-14-dashboard-workspace-registry-plan placeholders are machine-filled by
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
     The Test the WorkspacePicker four honest states and the add-a-project validation refusal and ## Scope

- `frontend/src/app/left/WorkspacePicker.render.test.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Test the WorkspacePicker four honest states and the add-a-project validation refusal

## Scope

- `frontend/src/app/left/WorkspacePicker.render.test.tsx`

## Description

- Add a render test for the WorkspacePicker covering the four honest states: loading (a quiet line), error with a retry control on a genuine `/workspaces` failure, the single-root quiet header (the empty/single-project case), and the designed degraded banner with its reason when the structural tier is down.
- Add a multi-root case (driven by a patched-body transport that rewrites the live `/workspaces` shape) asserting the expandable picker, the launch-default marker, and a kept-but-degraded unreachable root with its reason.
- Add the add-a-project validation-refusal case driven by the mock's REAL PUT /session register validation 400-ing a `bad`-prefixed path, plus a valid-registration case that flips the header into a picker.

## Outcome

The picker's honest states and the add-refusal are proven through the real stores client transport with no component-internal doubles, mirroring the worktree-switcher render-test discipline. All eight render-test cases pass.

## Notes

The degradation, multi-root, and unreachable states are driven by real `tiers` blocks and live-shaped bodies fed through the same client path the app uses, so the picker's degradation reading is verified against the real wire shape, never a stub.
