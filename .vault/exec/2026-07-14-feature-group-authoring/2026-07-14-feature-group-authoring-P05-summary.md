---
tags:
  - '#exec'
  - '#feature-group-authoring'
date: '2026-07-14'
modified: '2026-07-17'
related:
  - "[[2026-07-14-feature-group-authoring-plan]]"
---

# `feature-group-authoring` `P05` summary

## Description

P05 closed the plan: S12 relabeled the new-document verb feature-first once
on the descriptor plane — the descriptor label constant became "Add to a
Feature…" (Title Case, per the command-casing convention), driving context
menus, the command palette, and the derived keymap legend from the single
authored string; in-surface affordances follow (Features-header Plus
interpolates "Add a document to <section>", browser-region Plus and the
workspace empty-state read "Add to a feature" in Sentence case). No action
id, chord, or enrollment changed. S13 updated the three label-asserting
guard/render suites; the palette and action-coverage guards assert by
id/family/accelerator and passed unchanged. S14 ran the full gate honestly:
`just dev lint frontend` exit 0 and `just dev lint all` exit 0 (whole-
workspace clippy clean at run time), the feature sweep at 135 tests green
across 12 files, engine projection units 11/11, and vault check with no new
findings for this feature.

One caveat recorded verbatim in the S14 record: after the gate ran clean, a
concurrent foreign lane's uncommitted authoring decomposition re-broke the
`vaultspec-api` lib compile, which blocks re-running the (previously green,
clippy-compiled) route integration tests; every error sits in the foreign
`authoring/` files, none in this feature's lane, and nothing there was
touched.

- Modified: `frontend/src/stores/view/leftRailKeybindings.ts`, `frontend/src/app/left/BrowserRegion.tsx`, `frontend/src/app/stage/WorkspaceGhost.tsx`, `frontend/src/app/left/TreeBrowser.tsx`
- Modified: `frontend/src/app/newDocumentAffordances.guard.test.tsx`, `frontend/src/app/left/BrowserRegion.render.test.tsx`, `frontend/src/app/stage/WorkspaceGhost.render.test.tsx`
- Created: the S12/S13/S14 step records in this folder
