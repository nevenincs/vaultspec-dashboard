---
tags:
  - '#exec'
  - '#create-panel-hardening'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S12'
related:
  - "[[2026-07-14-create-panel-hardening-plan]]"
---

# Add a corpus-fed add-link affordance to the Linked documents row so removed links are keyboard-recoverable, reusing the shared combobox over the linking corpus

## Scope

- `frontend/src/app/left/CreateDocDialog.tsx`

## Description

- Add the corpus-fed add-link affordance to the Linked documents section (now always rendered): the shared combobox over the same linking corpus the editor's Related picker reads, committing a stem back through the bounded store setter (dedupe + 16-cap).

## Outcome

Removed links are keyboard-recoverable; locked by a live-engine remove-then-re-add test over the fixture corpus.

## Notes

Free text is disallowed (Related links only to existing documents, matching the editor's picker); an empty corpus degrades to the honest empty label.
