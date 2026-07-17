---
tags:
  - '#exec'
  - '#feature-group-authoring'
date: '2026-07-14'
modified: '2026-07-17'
related:
  - "[[2026-07-14-feature-group-authoring-plan]]"
---

# `feature-group-authoring` `P04` summary

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
