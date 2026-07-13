---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S16'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# Build the section comment thread panel with list, compose, resolve, and orphaned-anchor handling composed from kit atoms

## Scope

- `frontend/src/app/viewer/CommentThreadPanel.tsx`

## Description

- Build `CommentThreadPanel`, a light-dismiss popover composed from kit atoms, serving two roles: a per-section thread (that section's anchored comments plus a compose box) and the doc-level orphaned panel.
- List each comment with its author, a plain-language relative time, and its body; offer resolve/reopen, in-place edit, and delete per row with independent in-flight state.
- Compose builds the new comment's selector from the CURRENT section bytes via the shared `sectionSelectorForBlock`, which computes the git blob oid the backend fences against — so a freshly created comment lists as anchored immediately.
- Render orphaned comments under a clearly-labeled stale state with the typed drift reason in plain language and an explicit re-anchor-to-current-section action; re-anchor is offered only when the section still exists, never as a silent side effect of a read.
- Gate the compose box on the shared editor actor being bootstrapped, minting it lazily when a thread opens.
- Clamp the panel width to the reader pane (a container-query max-width) so a narrow reader never scrolls horizontally, and replace the compose box with an honest plain-language hint when the section's heading path is duplicated in the document (a comment there would silently orphan) — both landed as review polish.

## Outcome

Reading mode carries a complete section comment lifecycle — create, edit, resolve, reopen, delete, and honest orphan handling with explicit re-anchor — composed entirely from centralized atoms and tokens, every string in plain sentence-case language.

## Notes

Author attribution is the single shared V1 principal, rendered "You" for the human editor (the schema carries the full actor ref so it upgrades in place when per-human identity lands). The content hash is computed the SAME way the backend does (git blob oid of the raw section bytes) — proven against the live engine, so the selector resolves exact-or-conflict without a served-hash round trip.
