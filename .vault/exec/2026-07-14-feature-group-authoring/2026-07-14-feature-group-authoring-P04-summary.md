---
tags:
  - '#exec'
  - '#feature-group-authoring'
date: '2026-07-14'
modified: '2026-07-14'
related:
  - "[[2026-07-14-feature-group-authoring-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace feature-group-authoring with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- PHASE SUMMARY:
     This file rolls up every <Step Record> belonging to one Phase
     of the originating plan. Each Step (S##) in the Phase produces
     one <Step Record> in `.vault/exec/`; this summary aggregates
     them, lists modified / created files across the Phase, and
     reports verification status. -->

# `feature-group-authoring` `P04` summary

<!-- Brief summary of overall progress across every Step in this Phase,
     followed by a list of files touched across the Phase, e.g.:
     - Modified: `{file1}`
     - Created: `{file2}` -->

## Description

P04 rebuilt the create dialog as the two-stage feature-group panel mirroring
the user-approved Figma frames, executed by a delegated coder and
adversarially reviewed. S10: stage 1 (feature select-or-create over the
corpus combobox + the served pipeline coverage card with present/missing/
next-step rows and honest loading/degraded/new-feature states) and stage 2
(eligibility-gated document types rendered only from the offered-types
helper, plain-language labels with reason hints, editable pre-filled link
chips, verbatim served refusal surfacing). S11 verified the entry points: no
code change needed — every affordance already dispatches the one descriptor,
feature-scoped surfaces pre-answer stage 1; the per-document row menu opens
blank because the doc entity carries no feature field (a recorded future
refinement, not a defect).

The review initially WITHHELD on one HIGH: the type radiogroup's consumed
arrow keys leaked past preventDefault to the global keymap dispatcher, so
roving the type list also fired the graph nav commands. The revision added
stopPropagation on the consumed keys plus a non-tautological regression test
(window-spy with a live control assertion) and three mutually-exclusive
coverage-card state tests; the re-check APPROVED with H1 and M1 closed.
Residual LOWs (raw stem display, narrow seed race, default-stays-research)
are ADR-sanctioned or minor, recorded in the review.

- Modified: `frontend/src/app/left/CreateDocDialog.tsx`, `frontend/src/app/left/CreateDocDialog.render.test.tsx`
- Created: the S10/S11 step records in this folder

Verification: 15/15 render tests (live-engine over the fixture vault),
whole-frontend tsc clean, eslint/prettier/px clean; re-verified by the
reviewer. Sibling guard suites pass unchanged (descriptor plane untouched).
