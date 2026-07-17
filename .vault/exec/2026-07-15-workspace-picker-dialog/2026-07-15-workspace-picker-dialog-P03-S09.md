---
tags:
  - '#exec'
  - '#workspace-picker-dialog'
date: '2026-07-15'
modified: '2026-07-17'
step_id: 'S09'
related:
  - "[[2026-07-15-workspace-picker-dialog-plan]]"
---

# Rebuild the dialog: full-height browser body, unified path field (typing re-roots the browser, segment autocomplete, Enter never registers), footer confirm labeled with the selected folder name, and typed-reason error mapping deleting the message-regex mapper, with tests

## Scope

- `frontend/src/app/left/AddProjectDialog.tsx`

## Description

- Split the dialog into a thin gate plus `AddProjectDialogBody` so the picker's heavy hooks mount only while open (mount-gating; caught when the first draft mounted `useFsList` permanently) and per-open state resets for free
- Rebuild the body: unified monospace path field, places rail beside the full-height browser pane (stacking on compact), pinned footer with the refusal line, Cancel, and a confirm labeled with the target folder's name (`addNamed` interpolation)
- Implement the unified path field (ADR D5): typing re-roots the browser to the typed path's parent level with the unfinished segment as the engine-side filter (the narrowed level IS the autocomplete), debounced, with an error-driven ancestor retreat; Enter applies immediately and never registers; navigation/selection writes back into the field
- Confirm target: the selected row, else the authoritative browsed directory; disabled honestly when nothing is choosable (roots, placeholder level, or an already-registered directory)
- Refusals render friendly localized copy from the typed issue vocabulary (`classifyAddWorkspaceError` over `errorKind`); the submit guards double-fire and dismissal mid-flight
- Add a `medium` (45rem) size to the kit `Dialog` for the picker geometry; rewrite the dialog localization tests to the new contract

## Outcome

The dialog matches the binding Figma frames end to end; the browse, typed-path, filter, hidden, places, select-then-confirm, and refusal flows were live-driven against a real serve.

## Notes

- This step was co-developed in real time with the parallel localization session, which contributed the typed-path resolution-retreat refinement, the `dismissible` Dialog prop, and the response-level `is_registered` confirm gate; their `localeCompare` exact-match was re-expressed as a case-fold comparison to keep the localization scanner clean.
